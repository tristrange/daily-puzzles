/**
 * How the app names the two puzzle families.
 *
 * One table, because the names appear in the share text, the archive, the
 * stats page and the chooser, and four copies of the same two strings is four
 * places to forget a rename. The key is the `type` in a puzzle file, so nothing
 * here has to guess what a puzzle is.
 */

import type { PuzzleType } from './board'

export const PUZZLE_TYPE_LABEL: Record<PuzzleType, string> = {
  queens: 'Queens',
  'star-battle': 'Star Battle',
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
