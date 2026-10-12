/**
 * The Train Tracks rules, asserted on the app's own copy.
 *
 * The model is mirrored from `engine/src/queens_engine/tracks.py`, so the two
 * agree on what a *board* is, pinned by `conformance/`. What they cannot share is
 * what a *player's placement* means: the app's `isTracksSolved` has no Python
 * counterpart, because Python never holds a half-finished board. These tests are
 * therefore written against one hand-built solution at a time, and the fixtures
 * were checked against the engine's own solver rather than reasoned about.
 */

import { describe, expect, it } from 'vitest'
import { TrackGrid } from './tracks'
import {
  clearCell,
  createTracksGame,
  cyclePiece,
  isEmpty,
  isTracksSolved,
  resetGame,
  trackConflicts,
  type TracksGame,
} from './tracksGame'

/**
 * A 3x3 whose only line runs across the middle row.
 *
 * Rows want 0, 3, 0 and columns want 1 each. The two ends are givens at the middle
 * row's ends, which is the format's promise that the line's two open ends are fixed
 * before anything else is decided. Verified against the engine: exactly one
 * solution, `(0, 0, 0, 1, 1, 1, 0, 0, 0)`.
 */
function middleRow(): TrackGrid {
  return new TrackGrid(3, 3, [0, 3, 0], [1, 1, 1], [0, 0, 0, 1, 0, 1, 0, 0, 0])
}

/** The solved placement for `grid`, given as a row-major piece array. */
function placed(grid: TrackGrid, pieces: readonly number[]): TracksGame {
  return { grid, pieces }
}

describe('cyclePiece', () => {
  it('walks empty, the six pieces, and back to empty', () => {
    let game = createTracksGame(middleRow())
    expect(game.pieces[0]).toBe(0)
    for (let step = 1; step <= 6; step += 1) {
      game = cyclePiece(game, 0)
      expect(game.pieces[0]).toBe(step)
    }
    game = cyclePiece(game, 0)
    expect(game.pieces[0]).toBe(0)
  })

  it('refuses to cycle a given, because a given is the clue', () => {
    // Cell 3 is a given horizontal piece. Cycling it would let a player edit the
    // board's own statement, and the win check still expects the original.
    const game = createTracksGame(middleRow())
    expect(cyclePiece(game, 3)).toBe(game)
    expect(clearCell(game, 3)).toBe(game)
  })

  it('treats a given of zero as no clue rather than as an empty cell', () => {
    // `0` is the format's "nothing is given here". The player fills those cells
    // like any other, and the win check must not read `0` as a constraint.
    const grid = middleRow()
    expect(placed(grid, [0, 0, 0, 1, 1, 1, 0, 0, 0]).pieces[0]).toBe(0)
    expect(isTracksSolved(placed(grid, [0, 0, 0, 1, 1, 1, 0, 0, 0]))).toBe(true)
  })
})

describe('isEmpty', () => {
  it('is false the moment the player places anything', () => {
    const game = createTracksGame(middleRow())
    expect(isEmpty(game)).toBe(true)
    expect(isEmpty(cyclePiece(game, 0))).toBe(false)
  })

  it('is true again after a reset, which keeps the givens', () => {
    const game = resetGame(cyclePiece(createTracksGame(middleRow()), 0))
    expect(isEmpty(game)).toBe(true)
    expect(game.pieces).toEqual(middleRow().givens)
  })
})

describe('trackConflicts', () => {
  it('says nothing about the solved line', () => {
    const grid = middleRow()
    expect(trackConflicts(placed(grid, [0, 0, 0, 1, 1, 1, 0, 0, 0]))).toEqual([])
  })

  it('does not flag the two ends running off the grid', () => {
    // Both of the middle row's end pieces face outwards, and that is required:
    // a line has two ends and they leave the grid. A third would be the fault.
    const grid = middleRow()
    expect(
      trackConflicts(placed(grid, [0, 0, 0, 1, 1, 1, 0, 0, 0])).filter(
        (conflict) => conflict.rule === 'off-grid-end',
      ),
    ).toEqual([])
  })

  it('flags a piece whose end nothing meets', () => {
    const grid = middleRow()
    // Cell 4 turns south; the cell below it is empty.
    expect(trackConflicts(placed(grid, [0, 0, 0, 1, 5, 1, 0, 0, 0]))).toContainEqual({
      rule: 'unmet-end',
      cell: 4,
      other: 7,
    })
  })

  it('flags a row holding more than its clue', () => {
    const grid = middleRow()
    const game = cyclePiece(createTracksGame(grid), 0)
    // Row 0 wants 0 cells.
    expect(trackConflicts(game)).toContainEqual({ rule: 'row-count', cell: 0, other: 0 })
  })

  it('does not flag a row holding less than its clue', () => {
    // A short row is a puzzle still in progress, not a wrong answer.
    const game = createTracksGame(middleRow())
    expect(trackConflicts(game).filter((conflict) => conflict.rule === 'row-count')).toEqual([])
  })
})

describe('isTracksSolved', () => {
  it('accepts the line the grid was built around', () => {
    const grid = middleRow()
    expect(isTracksSolved(placed(grid, [0, 0, 0, 1, 1, 1, 0, 0, 0]))).toBe(true)
  })

  it('rejects the right cells with the wrong turn', () => {
    const grid = middleRow()
    // Correct count, but cell 4 turns south instead of continuing east.
    expect(isTracksSolved(placed(grid, [0, 0, 0, 1, 5, 1, 0, 0, 0]))).toBe(false)
  })

  it('rejects a board one cell short of its clue', () => {
    const grid = middleRow()
    expect(isTracksSolved(placed(grid, [0, 0, 0, 1, 1, 0, 0, 0, 0]))).toBe(false)
  })

  it('rejects a board that contradicts a given', () => {
    const grid = middleRow()
    expect(isTracksSolved(placed(grid, [0, 0, 0, 6, 1, 1, 0, 0, 0]))).toBe(false)
  })

  it('rejects a closed loop beside a finished line', () => {
    // Reciprocity plus exactly two open ends gives every cell two ends, so two
    // cells have one neighbour and the rest have two. That admits a single path
    // *and* any number of separate loops, so "one line" has to be checked, not
    // inferred.
    //
    // Found by searching the engine for a placement that passes every local rule
    // and is still not a solution, rather than built by hand — a hand-built one
    // was wrong twice before this one, and a fixture that is wrong about the
    // rules tests nothing.
    const grid = new TrackGrid(4, 4, [3, 3, 2, 1], [2, 3, 2, 2], [0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 6, 0, 0, 0])
    const pieces = [0, 2, 4, 5, 0, 2, 3, 6, 4, 6, 0, 0, 6, 0, 0, 0]
    // Every count is met, nothing is unmet and exactly two ends leave the grid,
    // so only the connectivity check can be what says no. Assert those first, so
    // this test cannot pass for the wrong reason.
    expect(trackConflicts(placed(grid, pieces))).toEqual([])
    expect(isTracksSolved(placed(grid, pieces))).toBe(false)
  })
})