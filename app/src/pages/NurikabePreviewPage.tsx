import { Link, useSearchParams } from 'react-router-dom'
import raw from '../data/nurikabe-previews.json'
import { parseNurikabeBoards } from '../domain/nurikabe'
import { NurikabeStage } from '../components/NurikabeStage'

const boards = parseNurikabeBoards(raw)
export function NurikabePreviewPage() {
  const [params, setParams] = useSearchParams()
  const requested = Number(params.get('board') ?? '1')
  const index = Number.isInteger(requested) && requested >= 1 && requested <= boards.length ? requested - 1 : 0
  const board = boards[index] ?? boards[0]
  if (!board) return null
  return <section className="puzzle-page nurikabe-preview">
    <Link to="/" className="back-link" aria-label="All puzzles"><span aria-hidden="true">←</span><span className="back-label">All puzzles</span></Link>
    <article className="puzzle">
      <div className="puzzle-heading">
        <Link className="puzzle-rules" to={{ pathname: '/how-to-play', hash: '#nurikabe' }} target="_blank" rel="noopener" aria-label="Nurikabe rules (opens in a new tab)">Rules <span aria-hidden="true">↗</span></Link>
        <h1>Nurikabe</h1><p className="puzzle-detail">Preview · Board {index + 1} of {boards.length} · {board.size}×{board.size}</p>
      </div>
      <NurikabeStage key={board.id} board={board} />
      <div className="word-preview-picker">
        <label htmlFor="nurikabe-preview-board">Choose a board</label>
        <select id="nurikabe-preview-board" value={index + 1} onChange={event => { setParams({ board: event.target.value }); window.scrollTo({ top: 0 }) }}>
          {boards.map((entry, i) => <option key={entry.id} value={i + 1}>Board {i + 1} of {boards.length} · {entry.size}×{entry.size}</option>)}
        </select>
      </div>
      <p className="word-note preview-note">Preview solves do not count toward daily stats, streaks or leaderboards. Your progress is saved separately.</p>
    </article>
  </section>
}
