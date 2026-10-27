import { Link, useSearchParams } from 'react-router-dom'
import raw from '../data/killer-sudoku-previews.json'
import { parseKillerPreviews } from '../domain/killerSudoku'
import { SudokuStage } from '../components/SudokuStage'

const boards = parseKillerPreviews(raw)

export function KillerSudokuPreviewPage() {
  const [params, setParams] = useSearchParams(), requested = Number(params.get('board') ?? '1')
  const index = Number.isInteger(requested) && requested >= 1 && requested <= boards.length ? requested - 1 : 0
  const board = boards[index]!
  return <section className="puzzle-page sudoku-preview">
    <Link to="/" className="back-link" aria-label="All puzzles"><span aria-hidden="true">←</span><span className="back-label">All puzzles</span></Link>
    <article className="puzzle">
      <div className="puzzle-heading">
        <Link className="puzzle-rules" to={{ pathname: '/how-to-play', hash: '#killer-sudoku' }} target="_blank" rel="noopener" aria-label="Killer Sudoku rules (opens in a new tab)">Rules <span aria-hidden="true">↗</span></Link>
        <h1>Killer Sudoku</h1><p className="puzzle-detail">Preview · Board {index + 1} · 9×9</p>
      </div>
      <p className="word-note">Fill rows, columns and boxes with 1–9. The digits in each dashed cage must add to its small number and cannot repeat within that cage.</p>
      <SudokuStage key={board.id} board={board} />
      <div className="word-preview-picker">
        <label htmlFor="killer-board">Choose a board</label>
        <select id="killer-board" value={index + 1} onChange={event => { setParams({ board: event.target.value }); window.scrollTo({ top: 0 }) }}>
          {boards.map((entry, i) => <option key={entry.id} value={i + 1}>Board {i + 1}</option>)}
        </select>
      </div>
      <p className="word-note preview-note">Preview progress saves separately in this browser and does not affect daily stats or leaderboards. Hints explain cage deductions and can be applied or undone.</p>
    </article>
  </section>
}
