import { archiveStart as ARCHIVE_START } from '../../../conformance/id-cases/manifest.json'
import type { PuzzleType } from '../domain/board'
import { parsePuzzleDate, previousPuzzleIds, puzzleIdFor, puzzleIdsForDay, puzzleTypeOf } from '../domain/dates'
import { ARCHIVE_WINDOW_DAYS, probePuzzles, type Fetcher, type PublishedPuzzle } from './puzzles'

/**
 * One archive page is a seven-day window. The cap keeps a hand-edited page query
 * from walking the calendar into absurd ranges before the loader can reject it.
 */
export const MAX_ARCHIVE_PAGE = 1000

/** How many days with unsolved candidates one surprise click may probe. */
const SURPRISE_DAY_LIMIT = 8

const DAY_MS = 86_400_000

/**
 * Whether `page`'s seven-day window can be followed by another one.
 *
 * The answer comes from the window's dates rather than from the puzzles that
 * loaded: an offline page may be empty while the archive still continues behind
 * it. Older is hidden once the current window contains the first archive date.
 */
export function hasOlderArchive(todayId: string, page: number): boolean {
  const oldest = previousPuzzleIds(todayId, ARCHIVE_WINDOW_DAYS, page * ARCHIVE_WINDOW_DAYS).at(-1)
  return oldest !== undefined && oldest > ARCHIVE_START
}

/** Parse a `?page=` value, falling back to the newest window. */
export function parseArchivePage(value: string | null): number {
  if (value === null) return 0
  const page = Number(value)
  return Number.isSafeInteger(page) && page >= 0 && page <= MAX_ARCHIVE_PAGE ? page : 0
}

/** URL for a game's archive page, omitting the query for the newest window. */
export function archiveHref(game: PuzzleType, page: number): string {
  return `/archive?game=${game}${page > 0 ? `&page=${page}` : ''}`
}

/** URL for one puzzle, carrying the archive page it was opened from. */
export function puzzleHref(id: string, page: number): string {
  return `/archive/${id}${page > 0 ? `?page=${page}` : ''}`
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
    // Match `listPublishedPuzzles`: a queued legacy Train Tracks board stays
    // discoverable beside the three daily sizes.
    const ids = [...new Set([...puzzleIdsForDay(day), puzzleIdFor(day, 'train-tracks')])]
      .filter((id) => puzzleTypeOf(id) === type)
    return ids.length === 0 ? [] : [{ day, ids }]
  })
}

/**
 * Pick a random unsolved, published puzzle of `type` from the archive.
 *
 * There is no index to pick from, so this samples archive days in random order
 * and probes only the ids that are not already solved. Days whose variants are
 * all solved cost no request. At most `maxDays` days with unsolved candidates
 * are probed, which keeps one click bounded even when the archive is large or
 * offline. A missing file is skipped; an unreachable one is reported so the
 * caller can distinguish "nothing left" from "could not check".
 */
export async function findSurprisePuzzle({
  todayId,
  type,
  solved,
  fetcher = fetch,
  random = Math.random,
  maxDays = SURPRISE_DAY_LIMIT,
}: SurpriseOptions): Promise<SurpriseOutcome> {
  const remaining = [...archiveDaysFor(todayId, type)]
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
      unsolved.push({
        id: probe.id,
        type: puzzle.puzzleType,
        difficulty: puzzle.difficulty,
        width: puzzle.board.width,
        height: puzzle.board.height,
      })
    }
    if (unsolved.length > 0) {
      const puzzle = unsolved[randomIndex(unsolved.length, random)]
      if (puzzle !== undefined) return { status: 'found', puzzle }
    }
  }

  return { status: 'none', checked, completed, unavailable }
}
