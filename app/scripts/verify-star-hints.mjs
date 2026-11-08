/** Check a Star Battle board from stdin, or every archived star board with --archive. */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

let server
try {
  const args = process.argv.slice(2)
  if (args.length > 1 || (args.length === 1 && args[0] !== '--archive')) throw new Error('Expected --archive or a puzzle on stdin')
  const archive = args.length === 1
  const directory = fileURLToPath(new URL('../public/puzzles/', import.meta.url))
  const inputs = archive
    ? readdirSync(directory).filter(name => /-star\.json$/.test(name)).sort()
      .map(name => ({ name, contents: readFileSync(join(directory, name), 'utf8') }))
    : [{ name: 'stdin', contents: readFileSync(0, 'utf8') }]
  if (!inputs.length) throw new Error('No Star Battle puzzles found')
  server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    configFile: false,
    appType: 'custom',
    resolve: { alias: { '@shared': fileURLToPath(new URL('../../', import.meta.url)) } },
    server: { middlewareMode: true },
    logLevel: 'silent',
  })
  const { parsePuzzle } = await server.ssrLoadModule('/src/domain/puzzle.ts')
  const { createGame, isSolved, placeQueenAutoMark, toggleMark } = await server.ssrLoadModule('/src/domain/game.ts')
  const { checkedHint } = await server.ssrLoadModule('/src/domain/checkedHints.ts')
  let stalled = false
  for (const { name, contents } of inputs) {
    const puzzle = parsePuzzle(JSON.parse(contents))
    const board = puzzle.board
    let game = createGame(board)
    let solved = false
    for (let move = 0; move <= board.cellCount * 2; move++) {
      if (isSolved(game)) { solved = true; break }
      const result = checkedHint(game)
      if (result.kind !== 'hint') break
      if (result.hint.action === 'clear') throw new Error(`${name}: hint tried to clear a verified entry`)
      const next = result.hint.action === 'queen'
        ? placeQueenAutoMark(game, result.hint.cell)
        : toggleMark(game, result.hint.cell)
      if (next.queens.size === game.queens.size && next.marks.size === game.marks.size) {
        throw new Error(`${name}: a hint did not change the board`)
      }
      game = next
    }
    if (!solved) {
      if (archive) console.error(`${name}: hints stalled`)
      stalled = true
      break
    }
  }
  process.stdout.write(stalled ? 'stalled\n' : archive ? `solved ${inputs.length} puzzles\n` : 'solved\n')
  process.exitCode = stalled ? 1 : 0
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 2
} finally {
  if (server) {
    try { await server.close() } catch (error) {
      console.error(error instanceof Error ? error.message : String(error))
      process.exitCode = 2
    }
  }
}
