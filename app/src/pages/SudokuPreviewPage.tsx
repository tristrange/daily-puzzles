import { Link, useSearchParams } from 'react-router-dom'
import raw from '../data/sudoku-previews.json'
import { parseSudokuBoards } from '../domain/sudoku'
import { SudokuStage } from '../components/SudokuStage'
const boards = parseSudokuBoards(raw)
const names = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }

export function SudokuPreviewPage() {
  const [params, setParams] = useSearchParams(), requested = Number(params.get('board') ?? '1')
  const index = Number.isInteger(requested) && requested >= 1 && requested <= boards.length ? requested - 1 : 0
  const board = boards[index]!
  return <section className="puzzle-page sudoku-preview">
    <Link to="/" className="back-link" aria-label="All puzzles"><span aria-hidden="true">←</span><span className="back-label">All puzzles</span></Link>
    <article className="puzzle">
      <div className="puzzle-heading">
        <Link className="puzzle-rules" to={{ pathname: '/how-to-play', hash: '#sudoku' }} target="_blank" rel="noopener" aria-label="Sudoku rules (opens in a new tab)">Rules <span aria-hidden="true">↗</span></Link>
        <h1>Sudoku</h1><p className="puzzle-detail">Preview · {names[board.level]} · 9×9</p>
      </div>
      <SudokuStage key={board.id} board={board} />
      <div className="word-preview-picker">
        <label htmlFor="sudoku-level">Choose a level</label>
        <select id="sudoku-level" value={index + 1} onChange={event => { setParams({ board: event.target.value }); window.scrollTo({ top: 0 }) }}>
          {boards.map((entry, i) => <option key={entry.id} value={i + 1}>{names[entry.level]}</option>)}
        </select>
      </div>
      <p className="word-note preview-note">Preview solves do not count toward daily stats, streaks or leaderboards. Progress saves separately in this browser.
        Levels describe the techniques required by our solver; your playtest helps us tune the challenge.</p>
    </article>
  </section>
}
