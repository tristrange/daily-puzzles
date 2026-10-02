/**
 * How the app names the two puzzle families.
 *
 * One table, because the names appear in the share text, the archive, the
 * stats page and the chooser, and four copies of the same two strings is four
 * places to forget a rename. The key is the `type` in a puzzle file, so nothing
 * here has to guess what a puzzle is.
 */

import type { PuzzleType } from './board'
import type { DifficultyBand } from './puzzle'

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
