import { archiveStart as ARCHIVE_START } from '../../../conformance/id-cases/manifest.json'
import type { PuzzleType } from '../domain/board'
import { parsePuzzleDate, previousPuzzleIds, puzzleDay, puzzleIdFor, puzzleIdsForDay, puzzleTypeOf } from '../domain/dates'
import { TRACK_LEGACY_END } from '../domain/trackSizes'
import type { Puzzle } from '../domain/puzzle'
import { ARCHIVE_WINDOW_DAYS, downloadedPuzzleIds, probePuzzles, readDownloadedPuzzle, type Fetcher, type PublishedPuzzle } from './puzzles'

/**
 * The cap keeps a hand-edited page query from walking the calendar into absurd
 * ranges before the loader can reject it.
 */
export const MAX_ARCHIVE_PAGE = 1000

/** How many days with unsolved candidates one surprise click may probe. */
const SURPRISE_DAY_LIMIT = 8

const DAY_MS = 86_400_000

export type ArchiveView = {
  readonly days: 7 | 14 | 30
  readonly order: 'newest' | 'oldest'
  readonly range: 'all' | '30' | '90' | '365'
}
export const DEFAULT_ARCHIVE_VIEW: ArchiveView = { days: 7, order: 'newest', range: 'all' }

export function parseArchiveView(params: URLSearchParams): ArchiveView {
  const days = params.get('days'), order = params.get('order'), range = params.get('range')
  return {
    days: days === '14' ? 14 : days === '30' ? 30 : 7,
    order: order === 'oldest' ? 'oldest' : 'newest',
    range: range === '30' || range === '90' || range === '365' ? range : 'all',
  }
}

/** Calendar windows keep every variant for a date on the same page. */
export function archiveWindow(todayId: string, page: number, view: ArchiveView) {
  const today = parsePuzzleDate(todayId).getTime(), start = parsePuzzleDate(ARCHIVE_START).getTime()
  const available = Math.max(0, Math.floor((today - start) / DAY_MS) + 1)
  const total = view.range === 'all' ? available : Math.min(available, Number(view.range))
  const skip = page * view.days, count = Math.max(0, Math.min(view.days, total - skip))
  const offset = view.order === 'newest' ? skip : Math.max(0, total - skip - count)
  const days = previousPuzzleIds(todayId, count, offset)
  return { days: view.order === 'oldest' ? days.reverse() : days, hasPrevious: page > 0, hasNext: skip + count < total }
}

function viewParams(page: number, view: ArchiveView): URLSearchParams {
  const params = new URLSearchParams()
  if (page > 0) params.set('page', String(page))
  if (view.days !== 7) params.set('days', String(view.days))
  if (view.order !== 'newest') params.set('order', view.order)
  if (view.range !== 'all') params.set('range', view.range)
  return params
}

/** Parse a `?page=` value, falling back to the newest window. */
export function parseArchivePage(value: string | null): number {
  if (value === null) return 0
  const page = Number(value)
  return Number.isSafeInteger(page) && page >= 0 && page <= MAX_ARCHIVE_PAGE ? page : 0
}

/** URL for a game's archive page, omitting the query for the newest window. */
export function archiveHref(game: PuzzleType, page: number, view: ArchiveView = DEFAULT_ARCHIVE_VIEW): string {
  const params = viewParams(page, view).toString()
  return `/archive?game=${game}${params ? `&${params}` : ''}`
}

/** URL for one puzzle, carrying the archive page it was opened from. */
export function puzzleHref(id: string, page: number, view: ArchiveView = DEFAULT_ARCHIVE_VIEW): string {
  const params = viewParams(page, view).toString()
  return `/archive/${id}${params ? `?${params}` : ''}`
}

export type SurpriseOutcome =
  | { readonly status: 'found'; readonly puzzle: PublishedPuzzle }
  | {
      readonly status: 'none'
      readonly checked: number
      readonly completed: number
      readonly unavailable: boolean
    }

type SurpriseOptions = {
  readonly todayId: string
  readonly type: PuzzleType
  readonly solved: ReadonlySet<string>
  readonly fetcher?: Fetcher
  readonly random?: () => number
  readonly maxDays?: number
  readonly range?: ArchiveView['range']
}

type DayCandidates = {
  readonly day: string
  readonly ids: readonly string[]
}

function randomIndex(length: number, random: () => number): number {
  return Math.min(length - 1, Math.max(0, Math.floor(random() * length)))
}

/**
 * Every archive day that can carry `type`, newest first, with its full id set.
 *
 * `puzzleIdsForDay` already knows each family's first archive day and its
 * variants. Asking it here keeps those dates and suffixes in one place instead
 * of repeating them in the archive.
 */
function archiveDaysFor(todayId: string, type: PuzzleType): readonly DayCandidates[] {
  const today = parsePuzzleDate(todayId).getTime()
  const start = parsePuzzleDate(ARCHIVE_START).getTime()
  const dayCount = Math.max(0, Math.floor((today - start) / DAY_MS) + 1)
  const days = previousPuzzleIds(
    todayId,
    Math.min(dayCount, MAX_ARCHIVE_PAGE * ARCHIVE_WINDOW_DAYS),
  )
  return days.flatMap((day) => {
    // The catalog's last original date includes the queued legacy boards that
    // overlap the three sizes, without inventing an original on every later day.
    const legacy = day <= TRACK_LEGACY_END ? [puzzleIdFor(day, 'train-tracks')] : []
    const ids = [...new Set([...puzzleIdsForDay(day), ...legacy])]
      .filter((id) => puzzleTypeOf(id) === type)
    return ids.length === 0 ? [] : [{ day, ids }]
  })
}

/**
 * Pick a random unsolved, published puzzle of `type` from the archive.
 *
 * This samples days in the chosen range in random order and probes only ids
 * that are not already solved. Days whose variants are
 * all solved cost no request. At most `maxDays` days with unsolved candidates
 * are probed, which keeps one click bounded even when the archive is large or
 * offline. A missing file is skipped; an unreachable one is reported so the
 * caller can distinguish "nothing left" from "could not check". If sampling
 * finds nothing, also check downloaded puzzles without making network requests.
 */
export async function findSurprisePuzzle({
  todayId,
  type,
  solved,
  fetcher = fetch,
  random = Math.random,
  maxDays = SURPRISE_DAY_LIMIT,
  range = 'all',
}: SurpriseOptions): Promise<SurpriseOutcome> {
  const firstDay = archiveWindow(todayId, 0, { days: 7, order: 'oldest', range }).days[0]
  const remaining = archiveDaysFor(todayId, type).filter(entry => firstDay !== undefined && entry.day >= firstDay)
  const probeLimit = Math.max(0, Math.floor(maxDays))
  let checked = 0
  let completed = 0
  let unavailable = false

  while (remaining.length > 0) {
    const [entry] = remaining.splice(randomIndex(remaining.length, random), 1)
    if (entry === undefined) break
    const unsolvedIds = entry.ids.filter((id) => !solved.has(id))
    completed += entry.ids.length - unsolvedIds.length
    if (unsolvedIds.length === 0) continue
    if (checked >= probeLimit) break
    checked += 1

    const probes = await probePuzzles(unsolvedIds, fetcher)
    const unsolved: PublishedPuzzle[] = []
    for (const probe of probes) {
      if (probe.unavailable) unavailable = true
      const puzzle = probe.puzzle
      if (puzzle === null || puzzle.puzzleType !== type) continue
      unsolved.push(publishedPuzzle(puzzle))
    }
    if (unsolved.length > 0) {
      const puzzle = unsolved[randomIndex(unsolved.length, random)]
      if (puzzle !== undefined) return { status: 'found', puzzle }
    }
  }

  const downloaded = (await downloadedPuzzleIds()).filter((id) =>
    puzzleTypeOf(id) === type && firstDay !== undefined && puzzleDay(id) >= firstDay && puzzleDay(id) <= todayId && !solved.has(id))
  while (downloaded.length) {
    const [id] = downloaded.splice(randomIndex(downloaded.length, random), 1)
    if (id === undefined) break
    const puzzle = await readDownloadedPuzzle(id)
    if (puzzle?.puzzleType === type) return { status: 'found', puzzle: publishedPuzzle(puzzle) }
  }
  return { status: 'none', checked, completed, unavailable }
}

function publishedPuzzle(puzzle: Puzzle): PublishedPuzzle {
  return {
    id: puzzle.id,
    type: puzzle.puzzleType,
    difficulty: puzzle.difficulty,
    width: puzzle.board.width,
    height: puzzle.board.height,
  }
}
