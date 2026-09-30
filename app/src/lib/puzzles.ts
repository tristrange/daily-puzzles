/**
 * Loading and archive discovery for committed puzzle files.
 *
 * The app is a static site: every puzzle is a JSON file under `public/puzzles/`
 * that the daily pipeline (M8) commits. There is deliberately no index
 * manifest — the archive is whatever files exist, so the list is discovered by
 * probing the recent window and keeping whatever responds.
 */

import { isPuzzleId, previousPuzzleIds } from '../domain/dates'
import { parsePuzzle, type Puzzle } from '../domain/puzzle'

export const ARCHIVE_WINDOW_DAYS = 30

export type Fetcher = (url: string) => Promise<Response>

export class PuzzleNotFoundError extends Error {
  readonly puzzleId: string

  constructor(puzzleId: string) {
    super(`no puzzle for ${puzzleId}`)
    this.name = 'PuzzleNotFoundError'
    this.puzzleId = puzzleId
  }
}

export function puzzleUrl(id: string): string {
  return `${import.meta.env.BASE_URL}puzzles/${id}.json`
}

/** Fetch and fully validate one puzzle file; throws `PuzzleNotFoundError`. */
export async function loadPuzzle(id: string, fetcher: Fetcher = fetch): Promise<Puzzle> {
  if (!isPuzzleId(id)) throw new PuzzleNotFoundError(id)
  const response = await fetcher(puzzleUrl(id))
  if (!response.ok) throw new PuzzleNotFoundError(id)
  return parsePuzzle(await response.json())
}

/** Published puzzle ids in the recent window, newest first. */
export async function listPublishedPuzzleIds(
  todayId: string,
  fetcher: Fetcher = fetch,
): Promise<readonly string[]> {
  const candidates = previousPuzzleIds(todayId, ARCHIVE_WINDOW_DAYS)
  const results = await Promise.allSettled(
    candidates.map(async (id) => {
      const response = await fetcher(puzzleUrl(id))
      return response.ok ? id : null
    }),
  )
  return results.flatMap((result) =>
    result.status === 'fulfilled' && result.value !== null ? [result.value] : [],
  )
}