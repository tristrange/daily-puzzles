import { useState } from 'react'
import { Link } from 'react-router-dom'
import { EnclosureGrid } from '../domain/enclosure'
import previews from '../domain/enclosurePreviews.json'
import solutions from '../domain/enclosurePreviewSolutions.json'
import { EnclosureStage } from '../components/EnclosureStage'
import { parseEnclosureSolution } from '../lib/enclosureSolution'

const boards = previews.map(data => new EnclosureGrid(data.size, data.water, data.horse, data.wallBudget, data.optimalScore))

export function EnclosurePreviewPage() {
  const [index, setIndex] = useState(0)
  const grid = boards[index] ?? boards[0]
  const previewId = `2000-01-${String(index + 1).padStart(2, '0')}-enclosure`
  const solution = grid ? parseEnclosureSolution(solutions[index], previewId, grid) : null
  return <article className="puzzle enclosure-puzzle enclosure-preview">
    <p className="eyebrow">Preview</p>
    <h1>Horse Enclosure</h1>
    <p>Practice without changing daily stats.</p>
    <div className="enclosure-preview-toolbar">
    <label>Board <select value={index} onChange={event => setIndex(Number(event.target.value))}>
      {boards.map((_, board) => <option key={board} value={board}>Meadow {board + 1}</option>)}
    </select></label>
    <Link to={{ pathname: '/how-to-play', hash: '#enclosure' }}>Rules ↗</Link>
    </div>
    {grid && <EnclosureStage key={index} grid={grid} previewId={previewId} {...(solution ? { previewSolution: solution } : {})} />}
  </article>
}
