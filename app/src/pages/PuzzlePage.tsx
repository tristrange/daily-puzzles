import { Link, useParams } from 'react-router-dom'
import { isPuzzleId, puzzleTypeOf } from '../domain/dates'
import { PUZZLE_TYPE_PUBLISHED, PUZZLE_TYPE_LABEL } from '../domain/games'
import { PuzzleView } from '../components/PuzzleView'

export function PuzzlePage() {
  const params = useParams<'id'>()
  const id = params.id
  if (id === undefined || !isPuzzleId(id)) {
    return (
      <section>
        <h1 className="page-title">Unknown puzzle</h1>
        <p className="status error">That doesn&rsquo;t look like a puzzle date.</p>
      </section>
    )
  }
  const type = puzzleTypeOf(id)!
  if (!PUZZLE_TYPE_PUBLISHED[type]) {
    return (
      <section>
        <h1 className="page-title">{PUZZLE_TYPE_LABEL[type]}</h1>
        <p className="status">The playing screen is not ready yet.</p>
        <Link to="/">Today&rsquo;s puzzles</Link>
      </section>
    )
  }
  return (
    <section className="puzzle-page">
      <Link to="/archive" className="back-link" aria-label="All puzzles">
        <span aria-hidden="true">←</span> <span className="back-label">All puzzles</span>
      </Link>
      <PuzzleView key={id} id={id} />
    </section>
  )
}
