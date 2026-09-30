import { Link, useParams } from 'react-router-dom'
import { formatPuzzleLabel, isPuzzleId } from '../domain/dates'
import { PuzzleView } from '../components/PuzzleView'

export function PuzzlePage() {
  const params = useParams<'id'>()
  const id = params.id
  if (id === undefined || !isPuzzleId(id)) {
    return (
      <section>
        <h2 className="page-title">Unknown puzzle</h2>
        <p className="status error">That doesn&rsquo;t look like a puzzle date.</p>
      </section>
    )
  }
  return (
    <section>
      <h2 className="page-title">
        <Link to="/archive" className="back-link">
          Archive
        </Link>
        <span aria-hidden="true"> · </span>
        {formatPuzzleLabel(id, Intl.DateTimeFormat().resolvedOptions().timeZone)}
      </h2>
      <PuzzleView key={id} id={id} />
    </section>
  )
}