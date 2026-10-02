import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatPuzzleLabel, puzzleOfToday } from '../domain/dates'
import { DIFFICULTY_LABEL, PUZZLE_TYPE_LABEL } from '../domain/games'
import {
  groupPublishedPuzzles,
  listPublishedPuzzles,
  type PublishedGroup,
  type PublishedPuzzle,
} from '../lib/puzzles'


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

  // Grouped while rendering rather than stored: it is a pure reshape of whatever
  // loaded, so deriving it on each pass keeps a second piece of state from ever
  // holding a stale arrangement of the first.
  const groups = state.status === 'ready' ? groupPublishedPuzzles(state.puzzles) : []

  return (
    <section>
      <h2 className="page-title">Archive</h2>
      {state.status === 'loading' && <p className="status">Scanning archive…</p>}
      {state.status === 'error' && (
        <p className="status error">Could not read the archive.</p>
      )}
      {state.status === 'ready' && <ArchiveGroups groups={groups} timeZone={timeZone} />}
    </section>
  )
}

/**
 * The archive itself: one named block per family, its puzzles underneath.
 *
 * Split out from the fetching so the markup can be rendered and asserted without a
 * browser or a network, which is the only way this part of the page gets covered
 * at all — the suite has no component renderer and pulling one in is a bigger
 * decision than this change.
 */
export function ArchiveGroups({
  groups,
  timeZone,
}: {
  readonly groups: readonly PublishedGroup[]
  readonly timeZone: string
}) {
  if (groups.length === 0) {
    return <p className="status">No puzzles have been published yet.</p>
  }
  return (
    <>
      {groups.map((group) => (
        <section className="archive-group" key={group.type}>
          <h3 className="archive-group-title">{PUZZLE_TYPE_LABEL[group.type]}</h3>
          <ul className="archive">
            {group.puzzles.map((puzzle) => (
              <li key={puzzle.id}>
                <Link to={`/archive/${puzzle.id}`}>{formatPuzzleLabel(puzzle.id, timeZone)}</Link>{' '}
                {/* The heading already said which family this is, so the row is the
                    date and its band. A puzzle with no band shows nothing at all:
                    "Easy" would be a claim the file never made. */}
                {puzzle.difficulty != null && (
                  <span className="stat-detail">{DIFFICULTY_LABEL[puzzle.difficulty]}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  )
}
