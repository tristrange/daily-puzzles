/**
 * The unlinked difficulty-test page.
 *
 * It plays the real board. `PuzzleStage` is the same component the site uses for
 * every published puzzle, so the click, the drag, the marks, the conflicts, the
 * hint button and the solved banner are the game's own and cannot drift from it.
 * The only thing this file adds is a different list of puzzles and a different
 * directory to fetch them from.
 *
 * An earlier version hand-wrote a board in vanilla JavaScript. It looked close
 * enough to pass a glance and was not: no marks, no drag, no conflict feedback,
 * and a Check button instead of a win. Everything about that page was a second
 * implementation of code that already existed and was already right.
 *
 * Not reachable from the site: nothing links here, and it is `noindex`. It has
 * its own build entry rather than a route because the site routes on the hash,
 * which would make the address `#/nightmare-test` instead of a path.
 */

import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'

import '../App.css'
import { PuzzleStage } from '../components/PuzzleView'
import { parsePuzzle, type Puzzle } from '../domain/puzzle'

interface ManifestEntry {
  file: string
  label: string
  score: number
}

const DIR = 'nightmare-test/'

function url(file: string): string {
  return `${import.meta.env.BASE_URL}${DIR}${file}`
}

function TestSet() {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const [boards, setBoards] = useState<{ entry: ManifestEntry; puzzle: Puzzle }[]>([])
  const [index, setIndex] = useState(0)
  const [failed, setFailed] = useState<string | null>(null)

  useEffect(() => {
    // Sequential rather than parallel: eight files from a static host arrive in
    // one go anyway, and this keeps the order the manifest declares.
    const load = async () => {
      const response = await fetch(url('manifest.json'))
      if (!response.ok) throw new Error(`manifest: ${response.status}`)
      const entries = (await response.json()) as ManifestEntry[]
      const loaded: { entry: ManifestEntry; puzzle: Puzzle }[] = []
      for (const entry of entries) {
        const file = await fetch(url(entry.file))
        if (!file.ok) throw new Error(`${entry.file}: ${file.status}`)
        loaded.push({ entry, puzzle: parsePuzzle(await file.json()) })
      }
      setBoards(loaded)
    }
    load().catch((error: unknown) => {
      setFailed(error instanceof Error ? error.message : String(error))
    })
  }, [])

  if (failed !== null) {
    return (
      <section>
        <h2 className="page-title">Could not load the test set</h2>
        <p className="status error">{failed}</p>
      </section>
    )
  }

  const current = boards[index]
  if (current === undefined) {
    return <p className="status">Loading the test set…</p>
  }

  return (
    <section>
      <h2 className="page-title">Queens test set</h2>
      <p className="status">
        One queen per colour, no two touching. Times are what matter — the score is ours, not
        yours.
      </p>
      <p>
        <label htmlFor="board-picker">Board: </label>
        <select
          id="board-picker"
          value={String(index)}
          onChange={(event) => setIndex(Number(event.target.value))}
        >
          {boards.map(({ entry }, position) => (
            <option key={entry.file} value={String(position)}>
              {entry.label} — ours scores {entry.score}
            </option>
          ))}
        </select>
      </p>
      {/* Keyed on the id so switching boards resets the game, the clock and the
          history, exactly as opening a different puzzle does. */}
      <div key={current.puzzle.id}>
        <PuzzleStage puzzle={current.puzzle} timeZone={timeZone} recordSolve={false} />
      </div>
    </section>
  )
}

const container = document.getElementById('root')
if (container === null) throw new Error('no #root to mount into')

createRoot(container).render(
  <StrictMode>
    <TestSet />
  </StrictMode>,
)
