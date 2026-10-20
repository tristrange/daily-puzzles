import { Link, useSearchParams } from 'react-router-dom'
import raw from '../data/tents-previews.json'
import { parseTentsBoard } from '../domain/tents'
import { TentsStage } from '../components/TentsStage'

const boards = raw.map(parseTentsBoard)
export function TentsPreviewPage() {
  const [params, setParams] = useSearchParams()
  const requested = Number(params.get('board') ?? '1')
  const index = Number.isInteger(requested) && requested >= 1 && requested <= boards.length ? requested - 1 : 0
  const board = boards[index]!
  return <section className="puzzle-page tents-preview">
    <Link to="/" className="back-link" aria-label="All puzzles"><span aria-hidden="true">←</span><span className="back-label">All puzzles</span></Link>
    <article className="puzzle">
      <div className="puzzle-heading">
        <Link className="puzzle-rules" to={{ pathname: '/how-to-play', hash: '#tents' }} target="_blank" rel="noopener" aria-label="Tents rules (opens in a new tab)">Rules <span aria-hidden="true">↗</span></Link>
        <h1>Tents</h1><p className="puzzle-detail">Preview · Board {index + 1} of {boards.length} · {board.size}×{board.size}</p>
      </div>
      <TentsStage key={board.id} board={board} />
      <div className="word-preview-picker">
        <label htmlFor="tents-preview-board">Choose a board</label>
        <select id="tents-preview-board" value={index + 1} onChange={event => { setParams({ board: event.target.value }); window.scrollTo({ top: 0 }) }}>
          {boards.map((entry, i) => <option key={entry.id} value={i + 1}>Board {i + 1} of {boards.length} · {entry.size}×{entry.size}</option>)}
        </select>
      </div>
      <p className="word-note preview-note">Preview solves do not count toward daily stats or streaks. Your progress is saved separately.</p>
    </article>
  </section>
}
