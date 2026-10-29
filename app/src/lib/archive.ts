import { archiveStart as ARCHIVE_START } from '../../../conformance/id-cases/manifest.json'
import type { PuzzleType } from '../domain/board'
import { previousPuzzleIds } from '../domain/dates'
import { ARCHIVE_WINDOW_DAYS } from './puzzles'

/**
 * One archive page is a seven-day window. The cap keeps a hand-edited page query
 * from walking the calendar into absurd ranges before the loader can reject it.
 */
export const MAX_ARCHIVE_PAGE = 1000

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
