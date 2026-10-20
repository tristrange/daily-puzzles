import type { PuzzleType } from '../domain/board'

/**
 * One archive page is a 30-day window. The cap keeps a hand-edited page query
 * from walking the calendar into absurd ranges before the loader can reject it.
 */
export const MAX_ARCHIVE_PAGE = 1000

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
