/**
 * Loading and archive discovery for committed puzzle files.
 *
 * The app is a static site: every puzzle is a JSON file under `public/puzzles/`
 * that the daily pipeline (M8) commits. There is deliberately no index
 * manifest — the archive is whatever files exist, so the list is discovered by
 * probing the recent window and keeping whatever comes back as a puzzle.
 */

import { PUZZLE_TYPES } from '../domain/board'
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

export function puzzleUrl(id: string, dir = 'puzzles/'): string {
  return `${import.meta.env.BASE_URL}${dir}${id}.json`
}

/**
 * Fetch and validate one puzzle file, or `null` when the day has none.
 *
 * `response.ok` cannot be trusted on its own. A dev or preview server has no
 * 404 for an unknown path under `public/`: it answers with the SPA shell, 200
 * and `text/html`. Both of the caller's failure modes hinge on telling a real
 * puzzle from that shell, so the body itself has to be the evidence.
 */
async function fetchPuzzle(id: string, fetcher: Fetcher, dir: string): Promise<Puzzle | null> {
  const response = await fetcher(puzzleUrl(id, dir))
  if (!response.ok) return null
  try {
    return parsePuzzle(await response.json())
  } catch {
    // The SPA shell, a truncated write, or a file that no longer validates.
    return null
  }
}

/** One id asked for, and the puzzle behind it if the day has one published. */
export type ProbedPuzzle = {
  readonly id: string
  readonly puzzle: Puzzle | null
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
        return { id, puzzle: await fetchPuzzle(id, fetcher, 'puzzles/') }
      } catch {
        return { id, puzzle: null }
      }
    }),
  )
}

/** Fetch and fully validate one puzzle file; throws `PuzzleNotFoundError`.
 *
 *  `dir` names the directory the files live in. It is a parameter rather than a
 *  constant so the unlinked difficulty-test page can read its own boards through
 *  this same path, instead of reimplementing the fetch and the shell-vs-puzzle
 *  check that `fetchPuzzle` exists to make.
 */
export async function loadPuzzle(
  id: string,
  fetcher: Fetcher = fetch,
  dir = 'puzzles/',
): Promise<Puzzle> {
  if (!isPuzzleId(id)) throw new PuzzleNotFoundError(id)
  const puzzle = await fetchPuzzle(id, fetcher, dir)
  if (puzzle === null) throw new PuzzleNotFoundError(id)
  return puzzle
}

/** A puzzle that is actually published, with the family and band its file declares. */
export type PublishedPuzzle = {
  readonly id: string
  readonly type: Puzzle['puzzleType']
  /** Null for files published before the weekly ramp, which record no band. */
  readonly difficulty: Puzzle['difficulty']
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
    candidates.map(async (id) => ({ id, puzzle: await fetchPuzzle(id, fetcher, 'puzzles/') })),
  )
  return results.flatMap((result) =>
    result.status === 'fulfilled' && result.value.puzzle !== null
      ? [
          {
            id: result.value.id,
            type: result.value.puzzle.puzzleType,
            difficulty: result.value.puzzle.difficulty,
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