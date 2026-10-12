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
  applyBrush,
  clearCell,
  createTracksGame,
  CROSS,
  MAYBE,
  isEmpty,
  cellState,
  hasPiece,
  isFault,
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

describe('applyBrush', () => {
  it('puts any of the nine things a cell can hold straight into a cell', () => {
    const game = createTracksGame(middleRow())
    for (const brush of [1, 2, 3, 4, 5, 6, CROSS, MAYBE]) {
      const next = applyBrush(game, 0, brush)
      expect(next.pieces[0]).toBe(brush)
      expect(cellState(next, 0)).toBe(
        brush === CROSS ? 'cross' : brush === MAYBE ? 'maybe' : 'piece',
      )
    }
  })

  it('takes back what it put there, so a misjudged click undoes itself', () => {
    // The reason a picker can have nine entries and still need no separate undo
    // gesture: applying a brush to a cell already holding it clears it. That is
    // also what makes the eraser the value zero rather than a case of its own --
    // running an eraser over an empty cell changes nothing at all.
    const game = createTracksGame(middleRow())
    const crossed = applyBrush(game, 0, CROSS)
    expect(applyBrush(crossed, 0, CROSS).pieces[0]).toBe(0)
    expect(applyBrush(applyBrush(game, 0, 3), 0, 0).pieces[0]).toBe(0)
    expect(applyBrush(game, 0, 0)).toBe(game)
  })

  it('replaces whatever was in the cell rather than adding to it', () => {
    // A cell holds one thing. Two collections for the pieces and the notes would
    // be a second thing to keep exclusive that already cannot collide.
    const game = applyBrush(applyBrush(createTracksGame(middleRow()), 0, 3), 0, CROSS)
    expect(game.pieces[0]).toBe(CROSS)
    expect(hasPiece(game, 0)).toBe(false)
  })

  it('refuses a given, and returns the same object when it does', () => {
    // Cell 3 is a given horizontal piece. Overwriting it would let a player edit
    // the board's own statement, and the win check still expects the original.
    //
    // Identity, not equality: the view decides a click changed nothing by
    // comparing the state it was handed with the one it already had, so returning
    // an equal-but-new object would record a history step for a click that did
    // nothing -- which enables an Undo that appears to do nothing and pushes a
    // real move out of the bounded history.
    const game = createTracksGame(middleRow())
    for (const brush of [1, CROSS, MAYBE, 0]) expect(applyBrush(game, 3, brush)).toBe(game)
    expect(clearCell(game, 3)).toBe(game)
  })

  it('returns the same object when clearing an already-empty cell', () => {
    const game = createTracksGame(middleRow())
    expect(clearCell(game, 0)).toBe(game)
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
    expect(isEmpty(applyBrush(game, 0, CROSS))).toBe(false)
  })

  it('is true again after a reset, which keeps the givens', () => {
    const game = resetGame(applyBrush(createTracksGame(middleRow()), 0, 3))
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

  it('does not call an unfinished route a fault', () => {
    const grid = middleRow()
    expect(isFault('unfinished-end')).toBe(false)
    expect(isFault('mismatched-end')).toBe(true)
    expect(isFault('row-count')).toBe(true)
    expect(isFault('col-count')).toBe(true)
    expect(isFault('off-grid-end')).toBe(true)
    // Still reported, and still counted towards the win check.
    const unfinished = placed(grid, [0, 0, 0, 1, 5, 1, 0, 0, 0])
    expect(trackConflicts(unfinished).length).toBeGreaterThan(0)
    expect(isTracksSolved(unfinished)).toBe(false)
  })

  it('tells an unfinished route apart from a piece facing the wrong way', () => {
    const grid = middleRow()
    // Cell 4 turns south at an empty cell: the route is not finished, which is
    // not the same fault as a piece pointing the wrong way, and saying so is the
    // difference between a warning and an accusation.
    const unfinished = trackConflicts(placed(grid, [0, 0, 0, 1, 5, 1, 0, 0, 0]))
    expect(unfinished).toContainEqual({ rule: 'unfinished-end', cell: 4, other: 7 })
    // Reported, but not a fault: an end pointing at an empty cell is what every
    // board looks like while it is being solved. Marking it red teaches a player
    // to ignore the marker, and then it is not doing its job either.
    // Nothing is marked that the player cannot fix: every fault this board
    // reports lands on a cell they placed, never on a given.
    const faults = unfinished.filter((c) => isFault(c.rule))
    expect(faults.length).toBeGreaterThan(0)
    for (const fault of faults) expect(middleRow().pieceAt(fault.cell)).toBe(0)

    // Cell 4 is vertical, so the given at cell 3 — which points east — meets a
    // cell facing the other way. That is a piece that is wrong, not a route that
    // is unfinished.
    const wrong = trackConflicts(placed(grid, [0, 0, 0, 1, 2, 1, 0, 0, 0]))
    expect(wrong).not.toContainEqual(expect.objectContaining({ rule: 'unfinished-end', cell: 3 }))
    // And it is reported against cell 4, not cell 3. Reciprocity is symmetric so
    // only one of the pair reports, and it must be the one the player can change:
    // a red cell that is a fixed clue is a red cell nothing can be done about.
    expect(wrong).toContainEqual({ rule: 'mismatched-end', cell: 4, other: 3 })
    expect(wrong).not.toContainEqual(expect.objectContaining({ rule: 'mismatched-end', cell: 3 }))
  })

  it('reports a corner turn running off the grid once, not once per arm', () => {
    // `openEnds` holds one entry per *end*, so a corner turn with both arms off
    // the grid is in it twice. The count needs that; the report does not, and two
    // identical sentences in one cell's label is worse than one.
    const grid = middleRow()
    const extra = trackConflicts(placed(grid, [5, 0, 0, 1, 1, 1, 0, 0, 0]))
    const faults = extra.filter((c) => c.rule === 'off-grid-end' && c.cell === 0)
    expect(faults).toHaveLength(1)
  })

  it('points at the extra end the player placed, not at the given ends', () => {
    // The grid's two given ends are correct by construction — the validator
    // refuses anything else — so marking them when a third appears points at two
    // fixed clues the player cannot change and hides what they just did.
    const grid = middleRow()
    const extra = trackConflicts(placed(grid, [1, 0, 0, 1, 1, 1, 0, 0, 0]))
    expect(extra.filter((c) => c.rule === 'off-grid-end').map((c) => c.cell)).toEqual([0])
  })

  it('flags only the cells a player can clear when a row is over its clue', () => {
    const grid = middleRow()
    const game = applyBrush(createTracksGame(grid), 0, 4)
    const rowFaults = trackConflicts(game).filter((c) => c.rule === 'row-count')
    // Row 0 wants 0 cells. Only cell 0 is placed and the player's, so it is the
    // only one flagged: the empty cells beside it have no action that helps, and
    // pointing at them invites the one action that makes it worse.
    expect(rowFaults).toEqual([{ rule: 'row-count', cell: 0, other: 0 }])
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

  it('rejects a good path that is short of a clue', () => {
    // Reciprocity, one path and exactly two open ends are all satisfied here, and
    // so is every local conflict rule — the line simply does not fill row 0 or
    // column 1. A ceiling check cannot see this, because nothing is over its
    // clue; the clues are the puzzle, so a line that misses them is not an answer
    // however well formed it is.
    const grid = new TrackGrid(4, 4, [3, 3, 2, 1], [2, 3, 2, 2], [0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 6, 0, 0, 0])
    const pieces = [0, 0, 0, 2, 0, 4, 1, 6, 4, 6, 0, 0, 6, 0, 0, 0]
    expect(trackConflicts(placed(grid, pieces))).toEqual([])
    expect(isTracksSolved(placed(grid, pieces))).toBe(false)
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