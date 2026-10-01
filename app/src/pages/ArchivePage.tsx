import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatPuzzleLabel, puzzleOfToday } from '../domain/dates'
import { listPublishedPuzzles, type PublishedPuzzle } from '../lib/puzzles'

const FAMILY_LABEL = { queens: 'Queens', 'star-battle': 'Star Battle' } as const

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; puzzles: readonly PublishedPuzzle[] }
  | { status: 'error' }

export function ArchivePage() {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const [todayId] = useState(() => puzzleOfToday(new Date(), timeZone))
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    listPublishedPuzzles(todayId).then(
      (puzzles) => {
        if (!cancelled) setState({ status: 'ready', puzzles })
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
        (state.puzzles.length === 0 ? (
          <p className="status">No puzzles have been published yet.</p>
        ) : (
          <ul className="archive">
            {state.puzzles.map((puzzle) => (
              <li key={puzzle.id}>
                <Link to={`/archive/${puzzle.id}`}>
                  {formatPuzzleLabel(puzzle.id, timeZone)}
                </Link>{' '}
                {/* Two puzzles share each day, so the date alone cannot say which
                    link goes where. */}
                <span className="stat-detail">{FAMILY_LABEL[puzzle.type]}</span>
              </li>
            ))}
          </ul>
        ))}
    </section>
  )
}