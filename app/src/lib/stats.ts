/**
 * Local solve history: what this browser has finished, and what that adds up to.
 *
 * Nothing here leaves the device. There is no account and no server, so the only
 * thing to get right is honesty about what is stored: a solve is recorded when it
 * happens and never revised, so a streak cannot be quietly rewritten by replaying
 * a day. The first solve of a puzzle is the one that counts — later attempts are
 * left out rather than allowed to overwrite it, because "when did you first get
 * this" is the question a streak is answering.
 *
 * The pure functions take the records as an argument and touch no globals, so the
 * arithmetic can be tested without a browser. The storage wrappers at the bottom
 * are the only part that knows about `localStorage`, and they are as forgiving as
 * the theme's: anything unrecognised is treated as no history at all.
 */

import { isPuzzleId, parsePuzzleDate, previousPuzzleIds } from '../domain/dates'

/** One finished puzzle. `hints` is how many hints were actually shown, not asked for. */
export type SolveRecord = {
  readonly id: string
  readonly puzzleType: 'queens' | 'star-battle'
  readonly size: number
  readonly elapsedMs: number
  readonly hints: number
  readonly solvedAt: number
}

export type Stats = {
  readonly solved: number
  readonly currentStreak: number
  readonly bestStreak: number
  readonly fastestMs: number | null
  readonly averageMs: number | null
  readonly hints: number
  readonly byType: Readonly<Record<'queens' | 'star-battle', number>>
}

/**
 * Where the history is kept between visits. Separate from the theme key so that
 * clearing one never takes the other with it.
 */
export const STATS_STORAGE_KEY = 'daily-puzzles:stats'

const PUZZLE_TYPES = ['queens', 'star-battle'] as const

function isWholeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

/**
 * One record out of untrusted storage, or `null` if it is not one. Every field is
 * checked rather than cast, because this data is hand-editable and survives
 * across versions: a field that did not exist when the record was written has to
 * drop the record, not become `undefined` in the middle of a streak calculation.
 *
 * The bounds are only what makes a number a number. A puzzle is 1 or more cells
 * wide and a solve takes no less than no time at all; anything stricter would be
 * guessing at the generator's future output and could drop a real solve.
 */
function toRecord(value: unknown): SolveRecord | null {
  if (typeof value !== 'object' || value === null) return null
  const entry = value as Record<string, unknown>
  const { id, puzzleType, size, elapsedMs, hints, solvedAt } = entry
  if (typeof id !== 'string' || !isPuzzleId(id)) return null
  if (typeof puzzleType !== 'string' || !PUZZLE_TYPES.some((type) => type === puzzleType)) return null
  if (!isWholeNumber(size) || size === 0) return null
  if (!isWholeNumber(elapsedMs)) return null
  if (!isWholeNumber(hints)) return null
  if (!isWholeNumber(solvedAt)) return null
  return { id, puzzleType: puzzleType as SolveRecord['puzzleType'], size, elapsedMs, hints, solvedAt }
}

/**
 * Stored history as records, oldest day first. A hand-edited or truncated file
 * loses its bad entries instead of the whole thing, and a puzzle id that appears
 * twice keeps its earliest solve, so a duplicated file cannot invent a longer
 * streak than the days actually played.
 */
export function parseStats(value: string | null | undefined): readonly SolveRecord[] {
  if (value === null || value === undefined) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  const earliest = new Map<string, SolveRecord>()
  for (const entry of parsed) {
    const record = toRecord(entry)
    if (record === null) continue
    const held = earliest.get(record.id)
    if (held === undefined || record.solvedAt < held.solvedAt) earliest.set(record.id, record)
  }
  return [...earliest.values()].sort((a, b) => (a.id < b.id ? -1 : 1))
}

/**
 * History with one solve added. The first solve of a day is kept: replaying a
 * puzzle leaves the record alone rather than restating when it was solved.
 *
 * The new list goes back through `parseStats` so that it is normalised exactly
 * like a list read from storage — sorted, and free of a duplicate id — rather
 * than carrying a second set of rules that could disagree with the first.
 */
export function addSolve(
  records: readonly SolveRecord[],
  record: SolveRecord,
): readonly SolveRecord[] {
  if (records.some((held) => held.id === record.id)) return records
  return parseStats(JSON.stringify([...records, record]))
}

const DAY_MS = 86_400_000

function daysBetween(laterId: string, earlierId: string): number {
  return Math.round((parsePuzzleDate(laterId).getTime() - parsePuzzleDate(earlierId).getTime()) / DAY_MS)
}

/**
 * Consecutive solved days ending today.
 *
 * A day you have not played yet does not break the streak, so this counts back
 * from yesterday when today is still unsolved. Otherwise the streak would read
 * zero every morning and the number would be useless.
 */
export function currentStreak(records: readonly SolveRecord[], todayId: string): number {
  if (records.length === 0) return 0
  const solved = new Set(records.map((record) => record.id))
  const days = previousPuzzleIds(todayId, records.length + 1)
  let streak = 0
  for (const day of solved.has(days[0] as string) ? days : days.slice(1)) {
    if (!solved.has(day)) break
    streak += 1
  }
  return streak
}

/** The longest run of consecutive solved days ever recorded. */
export function bestStreak(records: readonly SolveRecord[]): number {
  const ordered = [...records].sort((a, b) => (a.id < b.id ? -1 : 1))
  let best = 0
  let run = 0
  let previousId: string | null = null
  for (const record of ordered) {
    run = previousId !== null && daysBetween(record.id, previousId) === 1 ? run + 1 : 1
    if (run > best) best = run
    previousId = record.id
  }
  return best
}

/** Everything the stats page shows, derived from the records. */
export function summarise(records: readonly SolveRecord[], todayId: string): Stats {
  const solved = records.length
  if (solved === 0) {
    return {
      solved: 0,
      currentStreak: 0,
      bestStreak: 0,
      fastestMs: null,
      averageMs: null,
      hints: 0,
      byType: { queens: 0, 'star-battle': 0 },
    }
  }
  const elapsed = records.map((record) => record.elapsedMs)
  const total = elapsed.reduce((sum, ms) => sum + ms, 0)
  return {
    solved,
    currentStreak: currentStreak(records, todayId),
    bestStreak: bestStreak(records),
    fastestMs: Math.min(...elapsed),
    averageMs: Math.round(total / solved),
    hints: records.reduce((sum, record) => sum + record.hints, 0),
    byType: {
      queens: records.filter((record) => record.puzzleType === 'queens').length,
      'star-battle': records.filter((record) => record.puzzleType === 'star-battle').length,
    },
  }
}

/**
 * The stored history. Private browsing and blocked storage throw on *access*, not
 * just on write, so this has to be defensive to be worth having — a player who
 * blocks storage should still get a playable game.
 */
export function readStoredStats(): readonly SolveRecord[] {
  try {
    return parseStats(localStorage.getItem(STATS_STORAGE_KEY))
  } catch {
    return []
  }
}

/** Record a solve, keeping the history sorted. A puzzle already solved is left alone. */
export function storeSolve(record: SolveRecord): readonly SolveRecord[] {
  const records = addSolve(readStoredStats(), record)
  try {
    localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(records))
  } catch {
    // A solve that is not remembered is better than a page that breaks.
  }
  return records
}
