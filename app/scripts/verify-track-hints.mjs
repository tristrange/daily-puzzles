/** Read one generated board from stdin and check it with the actual app hints. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

let server
try {
  const puzzle = JSON.parse(readFileSync(0, 'utf8'))
  const { width, height, rowClues, colClues, givens } = puzzle.board
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
  let game = createTracksGame(new TrackGrid(width, height, rowClues, colClues, givens))
  let solved = false
  for (let move = 0; move <= width * height * 2; move++) {
    if (isTracksSolved(game)) { solved = true; break }
    const result = findTrackHint(game)
    if (result.kind === 'none') break
    if (result.kind === 'contradiction') throw new Error('Hint deductions contradicted the generated board')
    const next = applyTrackHint(game, result.hint)
    if (next === game) throw new Error('Hint did not change the generated board')
    game = next
  }
  process.stdout.write(solved ? 'solved\n' : 'stalled\n')
  process.exitCode = solved ? 0 : 1
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
