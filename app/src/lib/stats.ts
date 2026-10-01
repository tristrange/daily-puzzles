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

import { isPuzzleId, parsePuzzleDate, previousPuzzleIds, puzzleDay } from '../domain/dates'

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
 * The calendar days a set of records covers, each counted once.
 *
 * A day now carries two puzzles, so a record's id is not its day: streak maths
 * has to collapse the `-star` companion onto the same day as its Queens
 * sibling, or a player who only plays Star Battle would be credited no streak
 * at all, and one who plays both would have their best streak reset by the
 * second solve of a day they had already counted.
 */
function solvedDays(records: readonly SolveRecord[]): Set<string> {
  return new Set(records.map((record) => puzzleDay(record.id)))
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
  const solved = solvedDays(records)
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
  const days = [...solvedDays(records)].sort()
  let best = 0
  let run = 0
  let previousDay: string | null = null
  for (const day of days) {
    run = previousDay !== null && daysBetween(day, previousDay) === 1 ? run + 1 : 1
    if (run > best) best = run
    previousDay = day
  }
  return best
}

/**
 * The `limit` most recently *completed* solves, newest completion first.
 *
 * Ordered by when the solve happened, not by which day it is: a player who
 * returns to an older archive puzzle completes it today, and sorting by puzzle
 * id would file that under its date — pushing it off a list of the latest
 * solves entirely, which is the one list a player looks at.
 */
export function mostRecentSolves(
  records: readonly SolveRecord[],
  limit: number,
): readonly SolveRecord[] {
  return [...records]
    .sort((a, b) => b.solvedAt - a.solvedAt || (a.id < b.id ? 1 : -1))
    .slice(0, Math.max(0, limit))
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
 * Ids that were repurposed after the fact, and what they used to name.
 *
 * 2026-09-26 shipped as a Star Battle board under the bare date id, long before
 * every day had a companion. That board moved to `-star` and the bare date now
 * holds a Queens puzzle, so a record written against the old id would be read as
 * a solve of the *new* puzzle — and because the first solve of a day wins, the
 * player's real Queens solve for that date could never be recorded.
 *
 * The puzzle's own family is what tells the two apart: a legacy record says
 * `star-battle`, a Queens solve of that date says `queens`. That makes this
 * safe to run on every read rather than once behind a migration flag — a record
 * that arrives later with the same id and the other family is left alone.
 */
const REPURPOSED_IDS: readonly (readonly [string, string])[] = [['2026-09-26', '2026-09-26-star']]

function migrateRecords(records: readonly SolveRecord[]): readonly SolveRecord[] {
  return records.flatMap((record) => {
    const moved = REPURPOSED_IDS.find(([was]) => was === record.id)
    if (moved === undefined || record.puzzleType !== 'star-battle') return [record]
    return [{ ...record, id: moved[1] as string }]
  })
}

/**
 * The stored history. Private browsing and blocked storage throw on *access*, not
 * just on write, so this has to be defensive to be worth having — a player who
 * blocks storage should still get a playable game.
 *
 * Migration happens here rather than on write, so a player who only ever reads
 * their stats still sees them under the right puzzle. The next solve persists
 * the corrected ids, since `storeSolve` writes back everything it read.
 */
export function readStoredStats(): readonly SolveRecord[] {
  try {
    return migrateRecords(parseStats(localStorage.getItem(STATS_STORAGE_KEY)))
  } catch {
    return []
  }
}

/**
 * Forget everything: the key is removed rather than written empty, so a player who
 * has cleared their history is not left with an artefact of having had one.
 *
 * Only the solve history goes. The theme is a separate key on purpose — clearing
 * your solves should not also reset a preference you made once, and a player who
 * wants that back has a control for it in the header.
 *
 * Returns the empty history, which is what the page renders afterwards, so the
 * caller does not have to know what clearing means for its state.
 */
export function clearStats(): readonly SolveRecord[] {
  try {
    localStorage.removeItem(STATS_STORAGE_KEY)
  } catch {
    // Nothing to do: a browser that refuses the removal has not kept a history
    // this page can see either, since reading it is guarded the same way.
  }
  return []
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
