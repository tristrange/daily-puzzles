/**
 * Loading and archive discovery for committed puzzle files.
 *
 * The app is a static site: every puzzle is a JSON file under `public/puzzles/`
 * that the daily pipeline (M8) commits. There is deliberately no index
 * manifest — the archive is whatever files exist, so the list is discovered by
 * probing the recent window and keeping whatever comes back as a puzzle.
 */

import { PUZZLE_TYPES } from '../domain/board'
import { PUZZLE_DOWNLOAD_FAILED } from './offline'
import { isPuzzleId, previousPuzzleIds, puzzleIdFor, puzzleIdsForDay } from '../domain/dates'
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
export class PuzzleUnavailableError extends Error {
  constructor() {
    super('This puzzle is not saved on this device. Connect to the internet and try again.')
    this.name = 'PuzzleUnavailableError'
  }
}

const DOWNLOAD_CACHE = `daily-puzzles.puzzles:${import.meta.env.BASE_URL}:v1`

async function parsedResponse(id: string, response: Response): Promise<Puzzle | null> {
  if (!response.ok) return null
  try {
    const puzzle = parsePuzzle(await response.clone().json())
    return puzzle.id === id ? puzzle : null
  } catch { return null }
}

async function fetchPuzzle(id: string, fetcher: Fetcher): Promise<Puzzle | null> {
  if (!isPuzzleId(id)) return null
  const url = puzzleUrl(id)
  let unavailable = false
  try {
    const response = await fetcher(url)
    const puzzle = await parsedResponse(id, response)
    if (puzzle !== null) {
      try {
        await (await caches.open(DOWNLOAD_CACHE)).put(url, response)
      } catch {
        // Keep online play usable, but do not promise this board is saved.
        if (typeof window !== 'undefined') window.dispatchEvent(new Event(PUZZLE_DOWNLOAD_FAILED))
      }
      return puzzle
    }
    unavailable = !response.ok && response.status !== 404
  } catch { unavailable = true }
  try {
    if (typeof caches !== 'undefined') {
      const saved = await (await caches.open(DOWNLOAD_CACHE)).match(url)
      if (saved) {
        const puzzle = await parsedResponse(id, saved)
        if (puzzle !== null) return puzzle
      }
    }
  } catch { /* Missing or blocked storage is the same as no saved download. */ }
  if (unavailable) throw new PuzzleUnavailableError()
  return null
}

/** One id asked for, and the puzzle behind it if the day has one published. */
export type ProbedPuzzle = {
  readonly id: string
  readonly puzzle: Puzzle | null
  readonly unavailable?: boolean
}

/**
 * Ask for several puzzles at once, reporting a miss as an absent entry rather
 * than a rejection. Never rejects.
 *
 * The chooser needs this because "today" is not guaranteed to be complete: a
 * companion can be missing on a day the Queens board is already out, and a
 * rejection there would take the whole page down over one absent file.
 *
 * Never rejecting is the whole point, and it has to be per probe rather than
 * around the group. `Promise.all` rejects on the first failure and throws away
 * the results already in hand, so a request that fails at the network layer --
 * offline, blocked, a transient 5xx -- would report the *other* puzzle as
 * unpublished too. One unreachable file would take out a board that had already
 * loaded perfectly. Caught per probe, a failure costs exactly the card it
 * belongs to and no more.
 */
export async function probePuzzles(
  ids: readonly string[],
  fetcher: Fetcher = fetch,
): Promise<readonly ProbedPuzzle[]> {
  return Promise.all(
    ids.map(async (id): Promise<ProbedPuzzle> => {
      try {
        return { id, puzzle: await fetchPuzzle(id, fetcher) }
      } catch (error) {
        return { id, puzzle: null, ...(error instanceof PuzzleUnavailableError ? { unavailable: true } : {}) }
      }
    }),
  )
}

/** Load a validated network/download response, distinguishing absence from an unavailable download. */
export async function loadPuzzle(id: string, fetcher: Fetcher = fetch): Promise<Puzzle> {
  if (!isPuzzleId(id)) throw new PuzzleNotFoundError(id)
  const puzzle = await fetchPuzzle(id, fetcher)
  if (puzzle === null) throw new PuzzleNotFoundError(id)
  return puzzle
}

/** A puzzle that is actually published, with the family and band its file declares. */
export type PublishedPuzzle = {
  readonly id: string
  readonly type: Puzzle['puzzleType']
  /** Null for files published before the weekly ramp, which record no band. */
  readonly difficulty: Puzzle['difficulty']
  readonly width?: number
  readonly height?: number
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
  // Queued legacy boards remain accessible even after the daily slots change.
  const candidates = previousPuzzleIds(todayId, ARCHIVE_WINDOW_DAYS).flatMap((day) =>
    [...new Set([...puzzleIdsForDay(day), puzzleIdFor(day, 'train-tracks')])],
  )
  const results = await Promise.allSettled(
    candidates.map(async (id) => ({ id, puzzle: await fetchPuzzle(id, fetcher) })),
  )
  return results.flatMap((result) =>
    result.status === 'fulfilled' && result.value.puzzle !== null
      ? [
          {
            id: result.value.id,
            type: result.value.puzzle.puzzleType,
            difficulty: result.value.puzzle.difficulty,
            width: result.value.puzzle.board.width,
            height: result.value.puzzle.board.height,
          },
        ]
      : [],
  )
}

/** One family's published puzzles, in the order they were listed. */
export type PublishedGroup = {
  readonly type: Puzzle['puzzleType']
  readonly puzzles: readonly PublishedPuzzle[]
}

/**
 * Group published puzzles under the family each file declares.
 *
 * A flat list of dates mixed the families together, which left the date as the
 * only thing to tell a Queens board from its companion on a day when both are
 * present. Naming the family once per run of dates moves that job to the heading
 * and lets each row be the date and its band alone.
 *
 * Groups come out in `PUZZLE_TYPES` order, not in the order they were first seen
 * in, so the page reads the way the app declares its families and a third family
 * lands where it was declared rather than wherever its oldest puzzle happened to
 * fall. A family with nothing published in the window is left out: an empty
 * heading under a game the player cannot yet play is noise.
 *
 * Grouping reads the same `type` field the files declare, so a mislabelled file
 * is filed as what it is rather than as what its name promised.
 */
export function groupPublishedPuzzles(
  puzzles: readonly PublishedPuzzle[],
): readonly PublishedGroup[] {
  const byType = new Map<Puzzle['puzzleType'], PublishedPuzzle[]>()
  for (const puzzle of puzzles) {
    const bucket = byType.get(puzzle.type)
    if (bucket === undefined) byType.set(puzzle.type, [puzzle])
    else bucket.push(puzzle)
  }
  return PUZZLE_TYPES.filter((type) => byType.has(type)).map((type) => ({
    type,
    puzzles: byType.get(type) ?? [],
  }))
}