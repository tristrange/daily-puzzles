import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { PUZZLE_TYPES, type PuzzleType } from '../domain/board'
import { formatPuzzleLabel, puzzleDay } from '../domain/dates'
import { DEFAULT_PUZZLE_TYPE, DIFFICULTY_LABEL, PUZZLE_TYPE_LABEL, PUZZLE_TYPE_PUBLISHED } from '../domain/games'
import { sudokuVariantOf, killerVariantOf } from '../domain/sudokuLevels'
import { trackVariantOf } from '../domain/trackSizes'
import {
  archiveHref,
  findSurprisePuzzle,
  hasOlderArchive,
  MAX_ARCHIVE_PAGE,
  parseArchivePage,
  puzzleHref,
  type SurpriseOutcome,
} from '../lib/archive'
import {
  ARCHIVE_WINDOW_DAYS,
  groupPublishedPuzzles,
  listPublishedPuzzles,
  type PublishedGroup,
  type PublishedPuzzle,
} from '../lib/puzzles'
import { readStoredStats } from '../lib/stats'
import { useToday } from '../lib/useToday'


type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; day: string; page: number; puzzles: readonly PublishedPuzzle[] }
  | { status: 'error'; day: string; page: number }

type SurpriseState =
  | { status: 'idle' }
  | { status: 'searching' }
  | { status: 'message'; text: string }

const NO_SOLVES: ReadonlySet<string> = new Set()

/** Puzzle ids with a solve saved on this device. */
function storedSolvedIds(): ReadonlySet<string> {
  return new Set(typeof window === 'undefined' ? [] : readStoredStats().map((record) => record.id))
}

function surpriseMessage(
  outcome: Extract<SurpriseOutcome, { status: 'none' }>,
  label: string,
): string {
  if (outcome.checked === 0 && outcome.completed === 0) {
    return `No ${label} puzzles are in the archive yet.`
  }
  if (outcome.unavailable) {
    return 'Couldn’t reach the archive. Check your connection and try again.'
  }
  if (outcome.checked === 0 && outcome.completed > 0) {
    return `No unsolved ${label} puzzle was found. The ${label} puzzles found are already completed.`
  }
  return `No unsolved ${label} puzzle was found. Try again or choose another game.`
}

export function ArchivePage() {
  const [params] = useSearchParams()
  const type = PUZZLE_TYPES.find(type => type === params.get('game') && PUZZLE_TYPE_PUBLISHED[type]) ?? DEFAULT_PUZZLE_TYPE
  const page = parseArchivePage(params.get('page'))
  return (
    <section className="archive-page">
      <h1 className="page-title">Archive</h1>
      <p className="archive-note">Completed marks reflect solve history saved in this browser.</p>
      <nav className="game-picker" aria-label="Archive game">
        {PUZZLE_TYPES.filter(type => PUZZLE_TYPE_PUBLISHED[type]).map(game => (
          <Link key={game} to={archiveHref(game, page)} aria-current={game === type ? 'page' : undefined}>
            {PUZZLE_TYPE_LABEL[game]}
          </Link>
        ))}
      </nav>
      <ArchiveGame type={type} page={page} />
    </section>
  )
}

function ArchiveGame({ type, page }: { readonly type: PuzzleType; readonly page: number }) {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const todayId = useToday(timeZone)
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [solved, setSolved] = useState(storedSolvedIds)

  useEffect(() => {
    // Returning from a puzzle remounts this page, but a restored page or another
    // tab only announces itself through these events. Puzzle loading stays on its
    // own effect so refreshing completion never re-downloads the window.
    const refresh = () => setSolved(storedSolvedIds())
    const onVisibility = () => { if (!document.hidden) refresh() }
    window.addEventListener('focus', refresh)
    window.addEventListener('pageshow', refresh)
    window.addEventListener('storage', refresh)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('focus', refresh)
      window.removeEventListener('pageshow', refresh)
      window.removeEventListener('storage', refresh)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

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
      <SurpriseButton key={`${todayId}:${type}:${page}`} type={type} page={page} todayId={todayId} />
      {current.status === 'loading' && <p className="status" role="status">Scanning archive…</p>}
      {current.status === 'error' && (
        <p className="status error">Could not read the archive.</p>
      )}
      {current.status === 'ready' && <ArchiveGroups groups={groups} timeZone={timeZone} page={page} solved={solved} />}
      <ArchivePager game={type} page={page} todayId={todayId} />
    </div>
  )
}

function SurpriseButton({ type, page, todayId }: {
  readonly type: PuzzleType
  readonly page: number
  readonly todayId: string
}) {
  const navigate = useNavigate()
  const [surprise, setSurprise] = useState<SurpriseState>({ status: 'idle' })
  const request = useRef(0)

  useEffect(() => () => { request.current += 1 }, [])

  const surpriseMe = async () => {
    if (surprise.status === 'searching') return
    const currentRequest = ++request.current
    setSurprise({ status: 'searching' })
    const outcome = await findSurprisePuzzle({ todayId, type, solved: storedSolvedIds() })
    if (request.current !== currentRequest) return
    if (outcome.status === 'found') {
      if (storedSolvedIds().has(outcome.puzzle.id)) {
        setSurprise({ status: 'message', text: 'That puzzle was completed while searching. Try again.' })
        return
      }
      navigate(puzzleHref(outcome.puzzle.id, page))
      return
    }
    setSurprise({ status: 'message', text: surpriseMessage(outcome, PUZZLE_TYPE_LABEL[type]) })
  }

  return (
    <div className="archive-surprise">
      <button
        type="button"
        className="tool-button primary"
        onClick={surpriseMe}
        disabled={surprise.status === 'searching'}
        aria-label={`Surprise me: open a random unsolved ${PUZZLE_TYPE_LABEL[type]} puzzle`}
      >
        Surprise me
      </button>
      {surprise.status === 'searching' && (
        <p className="status" role="status">Finding an unsolved {PUZZLE_TYPE_LABEL[type]} puzzle…</p>
      )}
      {surprise.status === 'message' && (
        <p className="status" role="status">{surprise.text}</p>
      )}
    </div>
  )
}

function ArchivePager({ game, page, todayId }: {
  readonly game: PuzzleType
  readonly page: number
  readonly todayId: string
}) {
  return (
    <nav className="archive-pager" aria-label="Archive pages">
      {page > 0 && (
        <Link className="tool-button" aria-label="Show newer puzzles" to={archiveHref(game, page - 1)}>
          ← Newer
        </Link>
      )}
      {page < MAX_ARCHIVE_PAGE && hasOlderArchive(todayId, page) && (
        <Link className="tool-button" aria-label="Show older puzzles" to={archiveHref(game, page + 1)}>
          Older →
        </Link>
      )}
    </nav>
  )
}

function CompletedMark() {
  return <span className="archive-completed"><span aria-hidden="true">✓</span> Completed</span>
}

/** Render the loaded archive separately from discovery, including partial offline results. */
export function ArchiveGroups({
  groups,
  timeZone,
  page,
  solved = NO_SOLVES,
}: {
  readonly groups: readonly PublishedGroup[]
  readonly timeZone: string
  readonly page: number
  readonly solved?: ReadonlySet<string>
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
                  {group.type === 'train-tracks' || group.type === 'sudoku' || group.type === 'killer-sudoku' ? <>
                    <time dateTime={day}>{formatPuzzleLabel(day, timeZone)}</time>
                    <div className="archive-variants">
                      {puzzles.map(puzzle => {
                        const variant = (group.type === 'sudoku' || group.type === 'killer-sudoku') ? (killerVariantOf(puzzle.id) ?? sudokuVariantOf(puzzle.id)) : trackVariantOf(puzzle.id)
                        const dimensions = puzzle.width != null && puzzle.height != null ? `${puzzle.width}×${puzzle.height}` : ''
                        const label = variant ? `${variant.label}${dimensions ? ` · ${dimensions}` : ''}` : dimensions || 'Original'
                        const completed = solved.has(puzzle.id)
                        return <Link key={puzzle.id} to={puzzleHref(puzzle.id, page)} aria-label={`${formatPuzzleLabel(day, timeZone)}, ${PUZZLE_TYPE_LABEL[group.type]} ${label}${completed ? ', Completed' : ''}`}>
                          {variant ? <>{variant.label}<span className="archive-dimensions">{dimensions && ` · ${dimensions}`}</span></> : label}
                          {completed && <CompletedMark />}
                        </Link>
                      })}
                    </div>
                  </> : puzzles.map(puzzle => (
                    <Link key={puzzle.id} to={puzzleHref(puzzle.id, page)}>
                      <time dateTime={day}>{formatPuzzleLabel(day, timeZone)}</time>
                      {puzzle.difficulty != null && <span className="stat-detail">{DIFFICULTY_LABEL[puzzle.difficulty]}</span>}
                      {solved.has(puzzle.id) && <CompletedMark />}
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
