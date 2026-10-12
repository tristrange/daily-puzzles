/**
 * Shared helpers for the marks-genre tests.
 *
 * `Puzzle.board` is `Board | TrackGrid`, because Train Tracks plays a grid that is
 * not made of regions and is not square. Tests about the marks genres still read
 * regions, capacities and `size` directly, and they all mean "the marks board this
 * puzzle holds".
 *
 * One narrow in one place rather than a guard in each of them.
 */

import { Board } from './board'
import { isMarksPuzzle, type Puzzle } from './puzzle'

/**
 * The marks board a puzzle holds, narrowed from `Board | TrackGrid`.
 *
 * Throws if the puzzle is not a marks one, which is what a test reaching for
 * regions on a track grid deserves: the failure names the mistake rather than
 * surfacing later as a missing property.
 */
export function marksBoard(puzzle: Puzzle): Board {
  if (!isMarksPuzzle(puzzle)) {
    throw new TypeError(`${puzzle.puzzleType} is not played on a marks board`)
  }
  return puzzle.board
}
