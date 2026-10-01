/**
 * Calendar helpers for puzzle ids.
 *
 * Puzzle files are named `YYYY-MM-DD` and committed daily. The date a player is
 * owed is *their* calendar day, so "today" is a function of the instant and an
 * IANA time zone, never a guess about where the server sits.
 *
 * Each day can carry two puzzles, so an id may name which: the Queens puzzle is
 * the bare date and the Star Battle companion appends `-star`. The suffix is part
 * of the identity rather than a detail of the file, because a solve is recorded
 * against an id and first-solve-wins would otherwise let one of the two block the
 * other for the whole day.
 */

/** The variant suffix on a puzzle id, and the id of that puzzle's companion. */
export const STAR_SUFFIX = '-star' as const

const PUZZLE_ID_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(-star)?$/

export function isPuzzleId(value: string): boolean {
  const match = PUZZLE_ID_PATTERN.exec(value)
  if (match === null) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const normalised = new Date(Date.UTC(year, month - 1, day))
  return (
    normalised.getUTCFullYear() === year &&
    normalised.getUTCMonth() === month - 1 &&
    normalised.getUTCDate() === day
  )
}

/** True for the Star Battle companion's id, false for the day's Queens puzzle. */
export function isStarPuzzleId(value: string): boolean {
  return PUZZLE_ID_PATTERN.exec(value)?.[4] !== undefined
}

/** The bare date shared by both of a day's puzzles. */
export function puzzleDay(id: string): string {
  const match = PUZZLE_ID_PATTERN.exec(id)
  if (match === null) throw new RangeError(`${id} is not a YYYY-MM-DD puzzle id`)
  return `${match[1]}-${match[2]}-${match[3]}`
}

/** The day's other puzzle: the Star Battle companion of a Queens id, and back. */
export function companionPuzzleId(id: string): string {
  return isStarPuzzleId(id) ? puzzleDay(id) : `${puzzleDay(id)}${STAR_SUFFIX}`
}

/** Both puzzle ids for a calendar day, Queens first. */
export function puzzleIdsForDay(day: string): string[] {
  return [day, `${day}${STAR_SUFFIX}`]
}

/** The puzzle id owed to a player in `timeZone` at the instant `date`. */
export function puzzleOfToday(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const part = (type: string) => parts.find((piece) => piece.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

/**
 * A `Date` whose calendar day, formatted in any time zone within a dozen hours
 * of UTC, is the day the id names. Noon UTC is used so DST shifts never push a
 * display off the intended day.
 */
export function parsePuzzleDate(id: string): Date {
  if (!isPuzzleId(id)) throw new RangeError(`${id} is not a YYYY-MM-DD puzzle id`)
  const match = PUZZLE_ID_PATTERN.exec(id)
  if (match === null) throw new RangeError(`${id} is not a YYYY-MM-DD puzzle id`)
  const year = Number(match[1] ?? '')
  const month = Number(match[2] ?? '')
  const day = Number(match[3] ?? '')
  return new Date(Date.UTC(year, month - 1, day, 12))
}

/** "Wed, Sep 30, 2026" — the human label for a puzzle id. */
export function formatPuzzleLabel(id: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsePuzzleDate(id))
}

/** The previous `count` puzzle ids ending at `last` (inclusive), newest first. */
export function previousPuzzleIds(last: string, count: number): string[] {
  const ids: string[] = []
  const cursor = parsePuzzleDate(last)
  for (let index = 0; index < count; index += 1) {
    ids.push(puzzleOfToday(new Date(cursor.getTime() - index * 86_400_000), 'UTC'))
  }
  return ids
}