/**
 * Calendar helpers for puzzle ids.
 *
 * Puzzle files are named `YYYY-MM-DD` and committed daily. The date a player is
 * owed is *their* calendar day, so "today" is a function of the instant and an
 * IANA time zone, never a guess about where the server sits.
 *
 * Each day can carry a puzzle per family, so an id may name which: the daily
 * puzzle is the bare date and every other family appends its registered suffix.
 * The suffix is part of the identity rather than a detail of the file, because a
 * solve is recorded against an id and first-solve-wins would otherwise let one of
 * a day's puzzles block the others for the whole day.
 *
 * Every id question here is answered from `PUZZLE_TYPE_SUFFIX` rather than from a
 * test for `-star`, because the ids of a day are also what the app asks the network
 * for: a family with no suffix recognised here is a puzzle that is published,
 * correct, and never fetched.
 */

import { PUZZLE_TYPES, type PuzzleType } from './board'
import { DEFAULT_PUZZLE_TYPE, PUZZLE_TYPE_SUFFIX, isDefaultPuzzleType } from './games'

/** The day and family a puzzle id names. */
export type PuzzleIdParts = {
  /** The bare `YYYY-MM-DD` day both ids of that day share. */
  readonly day: string
  /** Which family's puzzle the id names. */
  readonly type: PuzzleType
}

/** True when `text` is a canonical `YYYY-MM-DD` date that exists as a calendar day. */
function isCalendarDay(text: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
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

/**
 * The day and family an id names, or `null` when it names neither.
 *
 * Built by asking each registered family whether it claims the id rather than by
 * matching one hand-written pattern, so a new family's suffix is recognised the
 * moment it is registered. A family is only credited if what is left over is a real
 * calendar day, which is what stops a bare date being read as some other family's.
 */
export function puzzleIdParts(value: string): PuzzleIdParts | null {
  for (const type of PUZZLE_TYPES) {
    const suffix = PUZZLE_TYPE_SUFFIX[type]
    if (suffix !== '' && !value.endsWith(suffix)) continue
    const day = value.slice(0, value.length - suffix.length)
    if (isCalendarDay(day)) return { day, type }
  }
  return null
}

export function isPuzzleId(value: string): boolean {
  return puzzleIdParts(value) !== null
}

/** Which family's puzzle an id names, or `null` when it names none. */
export function puzzleTypeOf(value: string): PuzzleType | null {
  return puzzleIdParts(value)?.type ?? null
}

/**
 * True for a companion id — one carrying a registered suffix — and false for the
 * day's default puzzle.
 *
 * Named for the slot rather than for Star Battle, because a second family with a
 * suffix is a companion too and a test for `-star` would quietly exclude it.
 */
export function isCompanionPuzzleId(value: string): boolean {
  const parts = puzzleIdParts(value)
  return parts !== null && !isDefaultPuzzleType(parts.type)
}

/** The bare date shared by every puzzle of that day. */
export function puzzleDay(id: string): string {
  const parts = puzzleIdParts(id)
  if (parts === null) throw new RangeError(`${id} is not a YYYY-MM-DD puzzle id`)
  return parts.day
}

/**
 * The day's other puzzle: the companion of a default id, and back.
 *
 * Written as "the default slot, or the one before it" so it holds for exactly two
 * families, which is what there are. With a third family the question "the day's
 * other puzzle" stops having one answer, and this should be replaced by a
 * `puzzleIdsForDay` lookup rather than guessed at.
 */
export function companionPuzzleId(id: string): string {
  const parts = puzzleIdParts(id)
  if (parts === null) throw new RangeError(`${id} is not a YYYY-MM-DD puzzle id`)
  const companion = isDefaultPuzzleType(parts.type) ? PUZZLE_TYPES[1] : DEFAULT_PUZZLE_TYPE
  return puzzleIdFor(parts.day, companion)
}

/** The id `type`'s puzzle carries for `day`, e.g. `2026-10-01-star`. */
export function puzzleIdFor(day: string, type: PuzzleType): string {
  if (!isCalendarDay(day)) throw new RangeError(`${day} is not a YYYY-MM-DD date`)
  return `${day}${PUZZLE_TYPE_SUFFIX[type]}`
}

/**
 * Every puzzle id a calendar day carries, one per registered family.
 *
 * This is the app's chokepoint for what exists: the chooser probes these for today
 * and the archive probes them for every day in its window, so nothing else ever
 * asks for a puzzle by id. A family missing from here is a puzzle that is published
 * correctly and never requested — invisible rather than broken, which is why the
 * list is derived from the registry instead of written out.
 */
export function puzzleIdsForDay(day: string): string[] {
  return PUZZLE_TYPES.map((type) => puzzleIdFor(day, type))
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
  const parts = puzzleIdParts(id)
  if (parts === null) throw new RangeError(`${id} is not a YYYY-MM-DD puzzle id`)
  const [year, month, day] = parts.day.split('-').map(Number) as [number, number, number]
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