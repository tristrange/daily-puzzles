import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { PUZZLE_TYPES, type PuzzleType } from '../domain/board'
import { formatPuzzleLabel, parsePuzzleDate, puzzleDay } from '../domain/dates'
import { DEFAULT_PUZZLE_TYPE, DIFFICULTY_LABEL, PUZZLE_TYPE_LABEL, PUZZLE_TYPE_PUBLISHED } from '../domain/games'
import { sudokuVariantOf, killerVariantOf } from '../domain/sudokuLevels'
import { trackVariantOf } from '../domain/trackSizes'
import {
  archiveHref,
  archiveWindow,
  DEFAULT_ARCHIVE_VIEW,
  findSurprisePuzzle,
  MAX_ARCHIVE_PAGE,
  parseArchivePage,
  parseArchiveView,
  puzzleHref,
  type ArchiveView,
  type SurpriseOutcome,
} from '../lib/archive'
import {
  groupPublishedPuzzles,
  listPublishedPuzzles,
  type PublishedGroup,
  type PublishedPuzzle,
} from '../lib/puzzles'
import { loadArchiveIndex, loadIndexedWindow } from '../lib/archiveIndex'
import { readStoredStats } from '../lib/stats'
import { useToday } from '../lib/useToday'


type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; key: string; puzzles: readonly PublishedPuzzle[] }
  | { status: 'error'; key: string }

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
  const navigate = useNavigate()
  const type = PUZZLE_TYPES.find(type => type === params.get('game') && PUZZLE_TYPE_PUBLISHED[type]) ?? DEFAULT_PUZZLE_TYPE
  const page = parseArchivePage(params.get('page'))
  const view = parseArchiveView(params)
  return (
    <section className="archive-page">
      <h1 className="page-title">Archive</h1>
      <p className="archive-note">Completed marks reflect solve history saved in this browser.</p>
      <label className="archive-game-select">
        Game
        <select value={type} onChange={event => {
          const game = PUZZLE_TYPES.find(item => item === event.currentTarget.value && PUZZLE_TYPE_PUBLISHED[item])
          if (game) navigate(archiveHref(game, page, view))
        }}>
          {PUZZLE_TYPES.filter(game => PUZZLE_TYPE_PUBLISHED[game]).map(game => (
            <option key={game} value={game}>{PUZZLE_TYPE_LABEL[game]}</option>
          ))}
        </select>
      </label>
      <nav className="game-picker" aria-label="Archive game">
        {PUZZLE_TYPES.filter(type => PUZZLE_TYPE_PUBLISHED[type]).map(game => (
          <Link key={game} to={archiveHref(game, page, view)} aria-current={game === type ? 'page' : undefined}>
            {PUZZLE_TYPE_LABEL[game]}
          </Link>
        ))}
      </nav>
      <ArchiveGame type={type} page={page} view={view} />
    </section>
  )
}

function ArchiveGame({ type, page, view }: { readonly type: PuzzleType; readonly page: number; readonly view: ArchiveView }) {
  const navigate = useNavigate()
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const todayId = useToday(timeZone)
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [index, setIndex] = useState<{ day: string; puzzles: readonly PublishedPuzzle[] | null } | null>(null)
  const [solved, setSolved] = useState(storedSolvedIds)
  const { days, order, range } = view
  const pageWindow = archiveWindow(todayId, page, view)
  const requestKey = `${todayId}:${page}:${days}:${order}:${range}`

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
    loadArchiveIndex().then(puzzles => { if (!cancelled) setIndex({ day: todayId, puzzles }) })
    return () => { cancelled = true }
  }, [todayId])

  useEffect(() => {
    if (!index || index.day !== todayId) return
    let cancelled = false
    const requested = archiveWindow(todayId, page, { days, order, range }).days
    const latest = order === 'oldest' ? requested.at(-1) : requested[0]
    const offset = latest ? Math.round((parsePuzzleDate(todayId).getTime() - parsePuzzleDate(latest).getTime()) / 86_400_000) : 0
    const loading = index.puzzles ? loadIndexedWindow(requested, index.puzzles)
      : requested.length ? listPublishedPuzzles(todayId, fetch, offset, requested.length)
        : Promise.resolve([])
    loading.then(
      (puzzles) => {
        const sorted = [...puzzles].sort((a, b) => order === 'oldest'
          ? puzzleDay(a.id).localeCompare(puzzleDay(b.id)) : puzzleDay(b.id).localeCompare(puzzleDay(a.id)))
        if (!cancelled) setState({ status: 'ready', key: requestKey, puzzles: sorted })
      },
      () => {
        if (!cancelled) setState({ status: 'error', key: requestKey })
      },
    )
    return () => {
      cancelled = true
    }
  }, [todayId, page, days, order, range, index, requestKey])

  // A result for a previous day or page is not the current archive window.
  // Keeping both beside the result lets a rollover or page change show loading
  // until the requested window lands, without an effect writing loading.
  const current = state.status !== 'loading' && state.key === requestKey
    ? state
    : { status: 'loading' as const }
  // Grouped while rendering rather than stored: it is a pure reshape of whatever
  // loaded, so deriving it on each pass keeps a second piece of state from ever
  // holding a stale arrangement of the first.
  const groups = current.status === 'ready' ? groupPublishedPuzzles(current.puzzles).filter(group => group.type === type) : []

  return (
    <div className="archive-content">
      <div className="archive-controls">
        <label>
          Dates per page
          <select value={days} onChange={event => {
            const value = event.currentTarget.value
            navigate(archiveHref(type, 0, { ...view, days: value === '14' ? 14 : value === '30' ? 30 : 7 }))
          }}>
            <option value="7">7 dates</option>
            <option value="14">14 dates</option>
            <option value="30">30 dates</option>
          </select>
        </label>
        <label>
          Order
          <select value={order} onChange={event => navigate(archiveHref(type, 0, {
            ...view, order: event.currentTarget.value === 'oldest' ? 'oldest' : 'newest',
          }))}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </label>
        <label>
          Date range
          <select value={range} onChange={event => {
            const value = event.currentTarget.value
            navigate(archiveHref(type, 0, { ...view, range: value === '30' || value === '90' || value === '365' ? value : 'all' }))
          }}>
            <option value="all">All dates</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="365">Last 365 days</option>
          </select>
        </label>
      </div>
      <SurpriseButton key={`${requestKey}:${type}`} type={type} page={page} todayId={todayId} view={view} />
      {current.status === 'loading' && <p className="status" role="status">Scanning archive…</p>}
      {current.status === 'error' && (
        <p className="status error">Could not read the archive.</p>
      )}
      {current.status === 'ready' && <ArchiveGroups groups={groups} timeZone={timeZone} page={page} view={view} solved={solved} />}
      <ArchivePager game={type} page={page} view={view} hasPrevious={pageWindow.hasPrevious} hasNext={pageWindow.hasNext} />
    </div>
  )
}

function SurpriseButton({ type, page, todayId, view }: {
  readonly type: PuzzleType
  readonly page: number
  readonly todayId: string
  readonly view: ArchiveView
}) {
  const navigate = useNavigate()
  const [surprise, setSurprise] = useState<SurpriseState>({ status: 'idle' })
  const request = useRef(0)

  useEffect(() => () => { request.current += 1 }, [])

  const surpriseMe = async () => {
    if (surprise.status === 'searching') return
    const currentRequest = ++request.current
    setSurprise({ status: 'searching' })
    const outcome = await findSurprisePuzzle({ todayId, type, solved: storedSolvedIds(), range: view.range })
    if (request.current !== currentRequest) return
    if (outcome.status === 'found') {
      if (storedSolvedIds().has(outcome.puzzle.id)) {
        setSurprise({ status: 'message', text: 'That puzzle was completed while searching. Try again.' })
        return
      }
      navigate(puzzleHref(outcome.puzzle.id, page, view))
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

function ArchivePager({ game, page, view, hasPrevious, hasNext }: {
  readonly game: PuzzleType
  readonly page: number
  readonly view: ArchiveView
  readonly hasPrevious: boolean
  readonly hasNext: boolean
}) {
  const previous = view.order === 'newest' ? 'Newer' : 'Older'
  const next = view.order === 'newest' ? 'Older' : 'Newer'
  return (
    <nav className="archive-pager" aria-label="Archive pages">
      {hasPrevious && (
        <Link className="tool-button" aria-label={`Show ${previous.toLowerCase()} puzzles`} to={archiveHref(game, page - 1, view)}>
          ← {previous}
        </Link>
      )}
      {page < MAX_ARCHIVE_PAGE && hasNext && (
        <Link className="tool-button" aria-label={`Show ${next.toLowerCase()} puzzles`} to={archiveHref(game, page + 1, view)}>
          {next} →
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
  view = DEFAULT_ARCHIVE_VIEW,
  solved = NO_SOLVES,
}: {
  readonly groups: readonly PublishedGroup[]
  readonly timeZone: string
  readonly page: number
  readonly view?: ArchiveView
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
                        return <Link key={puzzle.id} to={puzzleHref(puzzle.id, page, view)} aria-label={`${formatPuzzleLabel(day, timeZone)}, ${PUZZLE_TYPE_LABEL[group.type]} ${label}${completed ? ', Completed' : ''}`}>
                          {variant ? <>{variant.label}<span className="archive-dimensions">{dimensions && ` · ${dimensions}`}</span></> : label}
                          {completed && <CompletedMark />}
                        </Link>
                      })}
                    </div>
                  </> : puzzles.map(puzzle => (
                    <Link key={puzzle.id} to={puzzleHref(puzzle.id, page, view)}>
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
