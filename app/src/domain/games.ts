/**
 * How the app names and identifies the puzzle families.
 *
 * One table per fact, all keyed by `PuzzleType`, so the names appear in the share
 * text, the archive, the stats page and the chooser without four copies of the same
 * strings being four places to forget a rename. The key is the `type` in a puzzle
 * file, so nothing here has to guess what a puzzle is.
 *
 * Every table is a `Record<PuzzleType, …>` on purpose: adding a family to
 * `PUZZLE_TYPES` makes each of them a compile error, which is the whole point. A
 * third game that reaches `board.ts` and no further would simply be missing from
 * the archive and the share text, with nothing to say so.
 */

import type { PuzzleType } from './board'
import type { DifficultyBand } from './puzzle'

/**
 * The variant suffix on a puzzle id, keyed by family.
 *
 * The empty suffix is what makes the unsuffixed date the daily puzzle's id, and it
 * is why the type has to be a field rather than inferred from whether a suffix is
 * there: "has a suffix" is only the same question as "is the companion" for as
 * long as exactly one family has one.
 *
 * Mirrors `id_suffix` on the engine's `Rulebook`. The two are pinned together by
 * `conformance/id-cases/`, because the publisher writes these names and the app
 * routes them, and a spelling they disagree on is a puzzle nothing can find.
 */
export const PUZZLE_TYPE_SUFFIX: Record<PuzzleType, string> = {
  queens: '',
  'star-battle': '-star',
}

/** The family whose id carries no suffix: the day's default puzzle. */
export const DEFAULT_PUZZLE_TYPE: PuzzleType = 'queens'

/** True for the family whose id is a bare date, with nothing appended. */
export function isDefaultPuzzleType(puzzleType: PuzzleType): boolean {
  return PUZZLE_TYPE_SUFFIX[puzzleType] === PUZZLE_TYPE_SUFFIX[DEFAULT_PUZZLE_TYPE]
}

/**
 * Whether a family has a hint engine.
 *
 * Recorded here rather than tested for in two places, because the two callers have
 * to agree: the engine returns `null` for a family without one, and the UI hides
 * the button. Asked separately, a new family gets a visible button that does
 * nothing, or silently wrong hints — and a wrong hint is worse than none, since it
 * is a claim about a board the player is looking at. One table means registering
 * the family is also deciding this.
 */
export const PUZZLE_TYPE_HAS_HINTS: Record<PuzzleType, boolean> = {
  queens: true,
  'star-battle': false,
}

export const PUZZLE_TYPE_LABEL: Record<PuzzleType, string> = {
  queens: 'Queens',
  'star-battle': 'Star Battle',
}

/**
 * The band names the engine scores into, keyed by its 1-based level.
 *
 * Mirrors `LEVEL_NAMES` in `engine/src/queens_engine/difficulty.py`. It lives
 * here rather than in the file format so the engine keeps storing a small
 * integer while the app owns how a band reads to a player. A puzzle with no band
 * shows nothing at all: "Easy" would be a claim the file never made.
 */
export const DIFFICULTY_LABEL: Record<DifficultyBand, string> = {
  1: 'Easy',
  2: 'Medium',
  3: 'Hard',
  4: 'Expert',
  5: 'Nightmare',
}

/**
 * What a placed piece is called and drawn as, per family.
 *
 * The board's glyph, the cell's screen-reader noun and the rules page's prose all
 * read from here, so a cell's accessible name cannot end up calling a star a
 * queen.
 */
export const PUZZLE_PIECE: Record<PuzzleType, { noun: string; plural: string; glyph: string }> = {
  queens: { noun: 'queen', plural: 'queens', glyph: '♛' },
  'star-battle': { noun: 'star', plural: 'stars', glyph: '★' },
}
