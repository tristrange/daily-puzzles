/**
 * The unlinked difficulty-test page.
 *
 * It is the app. `Shell` gives it the header, the navigation and the theme
 * picker; `PuzzleView` loads a puzzle and plays it with `PuzzleStage`, the
 * component every published puzzle is played with. So the click, the drag, the
 * marks, the conflicts, the auto-mark, the hints, undo, reset and the solved
 * banner are the game's own code, and the theme follows the same stored choice
 * the rest of the site uses.
 *
 * The whole of what this page adds is the dropdown and the directory the boards
 * come from. Everything else is a component that already existed.
 *
 * This went wrong three times, all the same way: a hand-written board, then a
 * page shell that rebuilt `Shell`, then a manifest loader that rebuilt
 * `PuzzleView`. Each version looked close enough to pass a glance and was not —
 * no drag, no marks, no hints, no theme. Assembling a page is never the answer
 * when the site already has one.
 *
 * A separate build entry rather than a route, because the site routes on the
 * hash and a route could only be reached as `#/nightmare-test`. An entry emits
 * `dist/nightmare-test/index.html`, which the host serves at the path. Nothing
 * links here and the document is `noindex`.
 */

import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Route, Routes } from 'react-router-dom'

import '../index.css'
import { Shell } from '../components/Shell'
import { PuzzleView } from '../components/PuzzleView'
import { applyTheme, readStoredTheme } from '../lib/theme'

const DIR = 'nightmare-test/'

interface ManifestEntry {
  file: string
  label: string
  score: number
}

function TestSet() {
  const [boards, setBoards] = useState<ManifestEntry[]>([])
  const [index, setIndex] = useState(0)
  const [failed, setFailed] = useState<string | null>(null)

  useEffect(() => {
    // The picker only writes the attribute when clicked, so a stored choice has
    // to be applied here or the page ignores it until the first click.
    applyTheme(readStoredTheme())

    fetch(`${import.meta.env.BASE_URL}${DIR}manifest.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`manifest: ${response.status}`)
        return response.json() as Promise<ManifestEntry[]>
      })
      .then(setBoards)
      .catch((error: unknown) => {
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
  if (current === undefined) return <p className="status">Loading the test set…</p>

  // The file is named for the id the board carries, so the id is the file stem.
  const id = current.file.replace(/\.json$/, '')

  return (
    <section>
      <h2 className="page-title">Queens test set</h2>
      <p className="status">
        Eight boards our engine rates Nightmare. Time them — the score is ours, and it measures
        how hard the engine found a board, not how hard it is.
      </p>
      <p>
        <label htmlFor="board-picker">Board: </label>
        <select
          id="board-picker"
          value={String(index)}
          onChange={(event) => setIndex(Number(event.target.value))}
        >
          {boards.map((entry, position) => (
            <option key={entry.file} value={String(position)}>
              {entry.label} — ours scores {entry.score}
            </option>
          ))}
        </select>
      </p>
      {/* Keyed on the id by PuzzleView, so switching boards resets the game, the
          clock and the history exactly as opening a different puzzle does. */}
      <PuzzleView key={id} id={id} dir={DIR} recordSolve={false} />
    </section>
  )
}

function TestApp() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<TestSet />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}

const container = document.getElementById('root')
if (container === null) throw new Error('no #root to mount into')

createRoot(container).render(
  <StrictMode>
    <TestApp />
  </StrictMode>,
)
