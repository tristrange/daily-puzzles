/**
 * Loading and archive discovery for committed puzzle files.
 *
 * The app is a static site: every puzzle is a JSON file under `public/puzzles/`
 * that the daily pipeline (M8) commits. There is deliberately no index
 * manifest — the archive is whatever files exist, so the list is discovered by
 * probing the recent window and keeping whatever comes back as a puzzle.
 */

import { isPuzzleId, previousPuzzleIds, puzzleIdsForDay } from '../domain/dates'
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

/**
 * Fetch and validate one puzzle file, or `null` when the day has none.
 *
 * `response.ok` cannot be trusted on its own. A dev or preview server has no
 * 404 for an unknown path under `public/`: it answers with the SPA shell, 200
 * and `text/html`. Both of the caller's failure modes hinge on telling a real
 * puzzle from that shell, so the body itself has to be the evidence.
 */
async function fetchPuzzle(id: string, fetcher: Fetcher): Promise<Puzzle | null> {
  const response = await fetcher(puzzleUrl(id))
  if (!response.ok) return null
  try {
    return parsePuzzle(await response.json())
  } catch {
    // The SPA shell, a truncated write, or a file that no longer validates.
    return null
  }
}

/** Fetch and fully validate one puzzle file; throws `PuzzleNotFoundError`. */
export async function loadPuzzle(id: string, fetcher: Fetcher = fetch): Promise<Puzzle> {
  if (!isPuzzleId(id)) throw new PuzzleNotFoundError(id)
  const puzzle = await fetchPuzzle(id, fetcher)
  if (puzzle === null) throw new PuzzleNotFoundError(id)
  return puzzle
}

/** A puzzle that is actually published, with the family its file declares. */
export type PublishedPuzzle = {
  readonly id: string
  readonly type: Puzzle['puzzleType']
}

/**
 * Published puzzles in the recent window, newest day first and each day's
 * Queens puzzle before its Star Battle companion.
 *
 * Both ids of a day are probed rather than assumed, because the companion is a
 * separate file that a day may not have: it did not exist before companions
 * were published, and a missing one has to be absent rather than an error.
 *
 * The family comes from the file's own `type` rather than from the id's suffix.
 * Every probe already parses the file it fetched, so reading the answer off it
 * costs nothing, and it means a mislabelled file shows up as what it is instead
 * of as what its name promised.
 */
export async function listPublishedPuzzles(
  todayId: string,
  fetcher: Fetcher = fetch,
): Promise<readonly PublishedPuzzle[]> {
  const candidates = previousPuzzleIds(todayId, ARCHIVE_WINDOW_DAYS).flatMap(puzzleIdsForDay)
  const results = await Promise.allSettled(
    candidates.map(async (id) => ({ id, puzzle: await fetchPuzzle(id, fetcher) })),
  )
  return results.flatMap((result) =>
    result.status === 'fulfilled' && result.value.puzzle !== null
      ? [{ id: result.value.id, type: result.value.puzzle.puzzleType }]
      : [],
  )
}