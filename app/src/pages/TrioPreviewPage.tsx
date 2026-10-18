import { Link, useSearchParams } from 'react-router-dom'
import raw from '../data/trio-previews.json'
import { parseTrioBoard } from '../domain/trio'
import { TrioStage } from '../components/TrioStage'

const boards = raw.map(parseTrioBoard)
export function TrioPreviewPage() {
  const [params, setParams] = useSearchParams()
  const requested = Number(params.get('board') ?? '1')
  const index = Number.isInteger(requested) && requested >= 1 && requested <= boards.length ? requested - 1 : 0
  const board = boards[index]!
  return <section className="puzzle-page trio-preview">
    <Link to="/" className="back-link" aria-label="All puzzles"><span aria-hidden="true">←</span><span className="back-label">All puzzles</span></Link>
    <article className="puzzle">
      <div className="puzzle-heading">
        <Link className="puzzle-rules" to={{ pathname: '/how-to-play', hash: '#trio' }} target="_blank" rel="noopener" aria-label="Trio rules (opens in a new tab)">Rules <span aria-hidden="true">↗</span></Link>
        <h1>Trio</h1>
        <p className="puzzle-detail">Preview · Board {index + 1} of {boards.length} · 9×9</p>
      </div>
      <TrioStage key={board.id} board={board} />
      <div className="word-preview-picker">
        <label htmlFor="trio-preview-board">Choose a board</label>
        <select id="trio-preview-board" value={index + 1} onChange={(event) => { setParams({ board: event.target.value }); window.scrollTo({ top: 0 }) }}>
          {boards.map((entry, i) => <option key={entry.id} value={i + 1}>Board {i + 1} of {boards.length}</option>)}
        </select>
      </div>
      <p className="word-note preview-note">Preview solves do not count toward daily stats or streaks. Your progress is saved separately.</p>
    </article>
  </section>
}
