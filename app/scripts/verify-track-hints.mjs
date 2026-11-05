/** Check a generated board from stdin, or all archived tracks with --archive. */
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
    ? readdirSync(directory).filter(name => /-tracks(?:-(?:small|medium|large))?\.json$/.test(name)).sort()
      .map(name => ({ name, contents: readFileSync(join(directory, name), 'utf8') }))
    : [{ name: 'stdin', contents: readFileSync(0, 'utf8') }]
  if (!inputs.length) throw new Error('No Train Tracks puzzles found')
  server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    configFile: false,
    appType: 'custom',
    server: { middlewareMode: true },
    logLevel: 'silent',
  })
  const { TrackGrid } = await server.ssrLoadModule('/src/domain/tracks.ts')
  const { createTracksGame, isTracksSolved } = await server.ssrLoadModule('/src/domain/tracksGame.ts')
  const { findTrackHint, applyTrackHint } = await server.ssrLoadModule('/src/domain/trackHints.ts')
  let stalled = false
  for (const { name, contents } of inputs) {
    const { width, height, rowClues, colClues, givens } = JSON.parse(contents).board
    let game = createTracksGame(new TrackGrid(width, height, rowClues, colClues, givens))
    let solved = false
    for (let move = 0; move <= width * height * 2; move++) {
      if (isTracksSolved(game)) { solved = true; break }
      const result = findTrackHint(game)
      if (result.kind === 'none') break
      if (result.kind === 'contradiction') throw new Error(`${name}: hint deductions contradicted the board`)
      const next = applyTrackHint(game, result.hint)
      if (next === game) throw new Error(`${name}: a hint did not change the board`)
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
