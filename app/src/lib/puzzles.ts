/**
 * Loading and archive discovery for committed puzzle files.
 *
 * The app is a static site: every puzzle is a JSON file under `public/puzzles/`
 * that the daily pipeline (M8) commits. There is deliberately no index
 * manifest — the archive is whatever files exist, so the list is discovered by
 * probing the recent window and keeping whatever comes back as a puzzle.
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

/** Published puzzle ids in the recent window, newest first. */
export async function listPublishedPuzzleIds(
  todayId: string,
  fetcher: Fetcher = fetch,
): Promise<readonly string[]> {
  const candidates = previousPuzzleIds(todayId, ARCHIVE_WINDOW_DAYS)
  const results = await Promise.allSettled(
    candidates.map(async (id) => ({ id, puzzle: await fetchPuzzle(id, fetcher) })),
  )
  return results.flatMap((result) =>
    result.status === 'fulfilled' && result.value.puzzle !== null ? [result.value.id] : [],
  )
}