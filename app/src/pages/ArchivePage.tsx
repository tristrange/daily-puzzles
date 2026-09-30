import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatPuzzleLabel, puzzleOfToday } from '../domain/dates'
import { listPublishedPuzzleIds } from '../lib/puzzles'

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; ids: readonly string[] }
  | { status: 'error' }

export function ArchivePage() {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const [todayId] = useState(() => puzzleOfToday(new Date(), timeZone))
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    listPublishedPuzzleIds(todayId).then(
      (ids) => {
        if (!cancelled) setState({ status: 'ready', ids })
      },
      () => {
        if (!cancelled) setState({ status: 'error' })
      },
    )
    return () => {
      cancelled = true
    }
  }, [todayId])

  return (
    <section>
      <h2 className="page-title">Archive</h2>
      {state.status === 'loading' && <p className="status">Scanning archive…</p>}
      {state.status === 'error' && (
        <p className="status error">Could not read the archive.</p>
      )}
      {state.status === 'ready' &&
        (state.ids.length === 0 ? (
          <p className="status">No puzzles have been published yet.</p>
        ) : (
          <ul className="archive">
            {state.ids.map((id) => (
              <li key={id}>
                <Link to={`/archive/${id}`}>{formatPuzzleLabel(id, timeZone)}</Link>
              </li>
            ))}
          </ul>
        ))}
    </section>
  )
}