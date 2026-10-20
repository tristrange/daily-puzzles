import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PUZZLE_TYPES, type PuzzleType } from '../domain/board'
import { formatPuzzleLabel, puzzleDay } from '../domain/dates'
import { DEFAULT_PUZZLE_TYPE, DIFFICULTY_LABEL, PUZZLE_TYPE_LABEL, PUZZLE_TYPE_PUBLISHED } from '../domain/games'
import { trackVariantOf } from '../domain/trackSizes'
import {
  ARCHIVE_WINDOW_DAYS,
  groupPublishedPuzzles,
  listPublishedPuzzles,
  type PublishedGroup,
  type PublishedPuzzle,
} from '../lib/puzzles'
import { useToday } from '../lib/useToday'


type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; day: string; page: number; puzzles: readonly PublishedPuzzle[] }
  | { status: 'error'; day: string; page: number }

export function ArchivePage() {
  const [params] = useSearchParams()
  const type = PUZZLE_TYPES.find(type => type === params.get('game') && PUZZLE_TYPE_PUBLISHED[type]) ?? DEFAULT_PUZZLE_TYPE
  return (
    <section className="archive-page">
      <h1 className="page-title">Archive</h1>
      <nav className="game-picker" aria-label="Archive game">
        {PUZZLE_TYPES.filter(type => PUZZLE_TYPE_PUBLISHED[type]).map(game => (
          <Link key={game} to={`/archive?game=${game}`} aria-current={game === type ? 'page' : undefined}>
            {PUZZLE_TYPE_LABEL[game]}
          </Link>
        ))}
      </nav>
      <ArchiveGame type={type} />
    </section>
  )
}

function ArchiveGame({ type }: { readonly type: PuzzleType }) {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const todayId = useToday(timeZone)
  // The page is relative to the current day, so a rollover starts at the latest
  // window again instead of shifting the old page under the player's feet.
  const [view, setView] = useState({ day: todayId, page: 0 })
  const page = view.day === todayId ? view.page : 0
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    listPublishedPuzzles(todayId, fetch, page * ARCHIVE_WINDOW_DAYS).then(
      (puzzles) => {
        if (!cancelled) setState({ status: 'ready', day: todayId, page, puzzles })
      },
      () => {
        if (!cancelled) setState({ status: 'error', day: todayId, page })
      },
    )
    return () => {
      cancelled = true
    }
  }, [todayId, page])

  // A result for a previous day or page is not the current archive window.
  // Keeping both beside the result lets a rollover or page change show loading
  // until the requested window lands, without an effect writing loading.
  const current = state.status !== 'loading' && state.day === todayId && state.page === page
    ? state
    : { status: 'loading' as const }
  // Grouped while rendering rather than stored: it is a pure reshape of whatever
  // loaded, so deriving it on each pass keeps a second piece of state from ever
  // holding a stale arrangement of the first.
  const groups = current.status === 'ready' ? groupPublishedPuzzles(current.puzzles).filter(group => group.type === type) : []

  return (
    <div>
      {current.status === 'loading' && <p className="status" role="status">Scanning archive…</p>}
      {current.status === 'error' && (
        <p className="status error">Could not read the archive.</p>
      )}
      {current.status === 'ready' && <ArchiveGroups groups={groups} timeZone={timeZone} />}
      <ArchivePager page={page} onPage={(next) => setView({ day: todayId, page: next })} />
    </div>
  )
}

function ArchivePager({ page, onPage }: {
  readonly page: number
  readonly onPage: (page: number) => void
}) {
  return (
    <nav className="archive-pager" aria-label="Archive pages">
      {page > 0 && (
        <button type="button" className="tool-button" aria-label="Show newer puzzles" onClick={() => onPage(page - 1)}>
          ← Newer
        </button>
      )}
      <button type="button" className="tool-button" aria-label="Show older puzzles" onClick={() => onPage(page + 1)}>
        Older →
      </button>
    </nav>
  )
}

/** Render the loaded archive separately from discovery, including partial offline results. */
export function ArchiveGroups({
  groups,
  timeZone,
}: {
  readonly groups: readonly PublishedGroup[]
  readonly timeZone: string
}) {
  if (groups.length === 0) {
    return <p className="status">No puzzles in this archive window. Connect to load puzzles that are not saved on this device.</p>
  }
  return (
    <>
      {groups.map((group) => {
        const days = new Map<string, PublishedPuzzle[]>()
        for (const puzzle of group.puzzles) {
          const day = puzzleDay(puzzle.id)
          const entries = days.get(day) ?? []
          entries.push(puzzle)
          days.set(day, entries)
        }
        return (
          <section className="archive-group" key={group.type}>
            <h2 className="archive-group-title">{PUZZLE_TYPE_LABEL[group.type]}</h2>
            <ul className="archive">
              {[...days].map(([day, puzzles]) => (
                <li key={day}>
                  {group.type === 'train-tracks' ? <>
                    <time dateTime={day}>{formatPuzzleLabel(day, timeZone)}</time>
                    <div className="archive-variants">
                      {puzzles.map(puzzle => {
                        const variant = trackVariantOf(puzzle.id)
                        const dimensions = puzzle.width != null && puzzle.height != null ? `${puzzle.width}×${puzzle.height}` : ''
                        const label = variant ? `${variant.label}${dimensions ? ` · ${dimensions}` : ''}` : dimensions || 'Original'
                        return <Link key={puzzle.id} to={`/archive/${puzzle.id}`} aria-label={`${formatPuzzleLabel(day, timeZone)}, Train Tracks ${label}`}>
                          {variant ? <>{variant.label}<span className="archive-dimensions">{dimensions && ` · ${dimensions}`}</span></> : label}
                        </Link>
                      })}
                    </div>
                  </> : puzzles.map(puzzle => (
                    <Link key={puzzle.id} to={`/archive/${puzzle.id}`}>
                      <time dateTime={day}>{formatPuzzleLabel(day, timeZone)}</time>
                      {puzzle.difficulty != null && <span className="stat-detail">{DIFFICULTY_LABEL[puzzle.difficulty]}</span>}
                    </Link>
                  ))}
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </>
  )
}
