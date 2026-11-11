import { useState } from 'react'
import { Link } from 'react-router-dom'
import { EnclosureGrid } from '../domain/enclosure'
import previews from '../domain/enclosurePreviews.json'
import { EnclosureStage } from '../components/EnclosureStage'

const boards = previews.map(data => new EnclosureGrid(data.size, data.water, data.horse, data.wallBudget, data.optimalScore))

export function EnclosurePreviewPage() {
  const [index, setIndex] = useState(0)
  const grid = boards[index] ?? boards[0]
  return <article className="puzzle">
    <p className="eyebrow">Preview</p>
    <h1>Horse Enclosure</h1>
    <p>Enclose the horse using walls and water. Practice without changing your daily stats.</p>
    <div className="enclosure-preview-toolbar">
    <label>Board <select value={index} onChange={event => setIndex(Number(event.target.value))}>
      {boards.map((_, board) => <option key={board} value={board}>Meadow {board + 1}</option>)}
    </select></label>
    <Link to={{ pathname: '/how-to-play', hash: '#enclosure' }}>Rules ↗</Link>
    </div>
    {grid && <EnclosureStage key={index} grid={grid} previewId={`2000-01-0${index + 1}-enclosure`} />}
  </article>
}
