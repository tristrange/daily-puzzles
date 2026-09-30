/**
 * Calendar helpers for puzzle ids.
 *
 * Puzzle files are named `YYYY-MM-DD` and committed daily. The date a player is
 * owed is *their* calendar day, so "today" is a function of the instant and an
 * IANA time zone, never a guess about where the server sits.
 */

const PUZZLE_ID_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

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