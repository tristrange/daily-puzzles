/**
 * Player state transitions and conflict detection, for both puzzle types.
 *
 * For Queens (one piece per row, column and region) the conflict rules mirror
 * the puzzle's constraints: no two pieces may share a row, column or region, and
 * no two may touch (diagonals included). Rule precedence is row > column >
 * region > touch so a pair is reported under the most specific rule that
 * applies. For a k-star board a shared group only breaks its rule once it is
 * over capacity, which is what the Star Battle cases below pin.
 */

import { describe, expect, it } from 'vitest'
import { Board } from './board'
import {
  cellState,
  cellsEliminated,
  clearCell,
  conflicts,
  createGame,
  cycleCell,
  formatTime,
  isEmpty,
  isSolved,
  nextCellState,
  paintStroke,
  placeQueenAutoMark,
  resetGame,
  setCell,
  starsPerRow,
  toggleMark,
  toggleQueen,
} from './game'
import { parsePuzzle } from './puzzle'

const BLOCKS = new Board(4, [
  0, 0, 1, 1,
  0, 0, 1, 1,
  2, 2, 3, 3,
  2, 2, 3, 3,
], [1, 1, 1, 1], 'queens')

/** 4x4, four 2x2 regions, two stars per region (so two per row and column). */
const STAR_BLOCKS = new Board(4, [
  0, 0, 1, 1,
  0, 0, 1, 1,
  2, 2, 3, 3,
  2, 2, 3, 3,
], [2, 2, 2, 2], 'star-battle')

/** 8x8, one region per row band, two stars per region. Has a legal solution. */
const STAR_BANDS = new Board(
  8,
  Array.from({ length: 64 }, (_, cell) => Math.floor(cell / 8)),
  Array.from({ length: 8 }, () => 2),
  'star-battle',
)

/**
 * A complete 2-star solution: 2 per row, 2 per column, 2 per band, and no two
 * cells touching (found and verified by search, not by hand).
 */
const STAR_BANDS_SOLUTION = [1, 3, 13, 15, 17, 19, 29, 31, 32, 34, 44, 46, 48, 50, 60, 62]

describe('createGame and cellState', () => {
  it('starts empty', () => {
    const game = createGame(BLOCKS)
    for (let cell = 0; cell < BLOCKS.cellCount; cell += 1) {
      expect(cellState(game, cell)).toBe('empty')
    }
  })
})

describe('toggleQueen', () => {
  it('places a queen and reports it', () => {
    const game = toggleQueen(createGame(BLOCKS), 0)
    expect(cellState(game, 0)).toBe('queen')
    expect(game.marks.has(0)).toBe(false)
  })

  it('removes the queen on a second toggle', () => {
    const game = toggleQueen(toggleQueen(createGame(BLOCKS), 0), 0)
    expect(cellState(game, 0)).toBe('empty')
  })

  it('clears a mark on the cell', () => {
    const marked = toggleMark(createGame(BLOCKS), 0)
    const game = toggleQueen(marked, 0)
    expect(cellState(game, 0)).toBe('queen')
    expect(game.marks.has(0)).toBe(false)
  })
})

describe('toggleMark', () => {
  it('marks a cell and reports it', () => {
    const game = toggleMark(createGame(BLOCKS), 0)
    expect(cellState(game, 0)).toBe('mark')
  })

  it('removes the mark on a second toggle', () => {
    const game = toggleMark(toggleMark(createGame(BLOCKS), 0), 0)
    expect(cellState(game, 0)).toBe('empty')
  })

  it('takes back a queen', () => {
    const game = toggleMark(toggleQueen(createGame(BLOCKS), 0), 0)
    expect(cellState(game, 0)).toBe('mark')
    expect(game.queens.has(0)).toBe(false)
  })
})

describe('clearCell', () => {
  it('clears a queen', () => {
    const game = clearCell(toggleQueen(createGame(BLOCKS), 3), 3)
    expect(cellState(game, 3)).toBe('empty')
  })

  it('clears a mark', () => {
    const game = clearCell(toggleMark(createGame(BLOCKS), 3), 3)
    expect(cellState(game, 3)).toBe('empty')
  })

  it('is a no-op on an empty cell', () => {
    const game = clearCell(createGame(BLOCKS), 3)
    expect(cellState(game, 3)).toBe('empty')
  })
})

describe('resetGame', () => {
  it('clears every piece and mark', () => {
    const played = placeQueenAutoMark(toggleMark(createGame(BLOCKS), 12), 0)
    expect(isEmpty(played)).toBe(false)

    const fresh = resetGame(played)

    expect(fresh.queens.size).toBe(0)
    expect(fresh.marks.size).toBe(0)
    expect(isEmpty(fresh)).toBe(true)
  })

  it('keeps the same board, so the puzzle is unchanged', () => {
    const played = toggleQueen(createGame(BLOCKS), 5)

    expect(resetGame(played).board).toBe(played.board)
  })

  it('does not disturb the state it was given', () => {
    // Reset is a transition like any other: the caller's state is still theirs,
    // which is what lets the UI keep it as a single undo step.
    const played = toggleMark(createGame(BLOCKS), 7)

    resetGame(played)

    expect(cellState(played, 7)).toBe('mark')
  })

  it('is a no-op on a board that is already empty', () => {
    const fresh = createGame(BLOCKS)

    const again = resetGame(fresh)

    expect(again.queens.size).toBe(0)
    expect(again.marks.size).toBe(0)
  })

  it('leaves a nearly-solved board unsolved', () => {
    // The reset is applied through the same transition that detects a win, so a
    // board cleared one move from finished must not read as solved — that would
    // record a solve time for a board with nothing on it.
    const nearly = toggleQueen(toggleQueen(toggleQueen(createGame(BLOCKS), 0), 5), 10)
    expect(isSolved(nearly)).toBe(false)

    expect(isSolved(resetGame(nearly))).toBe(false)
  })
})

describe('isEmpty', () => {
  it('is false with only a mark', () => {
    expect(isEmpty(toggleMark(createGame(BLOCKS), 1))).toBe(false)
  })

  it('is false with only a piece', () => {
    expect(isEmpty(toggleQueen(createGame(BLOCKS), 1))).toBe(false)
  })

  it('is true once both are gone again', () => {
    const played = toggleMark(toggleQueen(createGame(BLOCKS), 1), 6)

    expect(isEmpty(clearCell(clearCell(played, 1), 6))).toBe(true)
  })
})

describe('setCell', () => {
  it('forces a mark, clearing a piece on the way', () => {
    // A primitive with no policy: the paths that remove a piece on purpose
    // depend on it being able to. `paintStroke` is where strokes are stopped.
    const game = setCell(toggleQueen(createGame(BLOCKS), 3), 3, 'mark')
    expect(cellState(game, 3)).toBe('mark')
    expect(game.queens.has(3)).toBe(false)
  })

  it('forces a piece, clearing a mark on the way', () => {
    const game = setCell(toggleMark(createGame(BLOCKS), 3), 3, 'queen')
    expect(cellState(game, 3)).toBe('queen')
    expect(game.marks.has(3)).toBe(false)
  })

  it('forces empty, clearing either', () => {
    expect(cellState(setCell(toggleMark(createGame(BLOCKS), 3), 3, 'empty'), 3)).toBe('empty')
    expect(cellState(setCell(toggleQueen(createGame(BLOCKS), 3), 3, 'empty'), 3)).toBe('empty')
  })

  it('is idempotent, which is what a drag stroke relies on', () => {
    // Painting the same cell twice during one stroke has to be a no-op, or the
    // stroke's own history entry would depend on how fast the pointer moved.
    const once = setCell(createGame(BLOCKS), 3, 'mark')
    expect(cellState(setCell(once, 3, 'mark'), 3)).toBe('mark')
    expect(setCell(once, 3, 'mark')).toEqual(once)
  })

  it('leaves the rest of the board alone', () => {
    const start = toggleQueen(createGame(BLOCKS), 0)
    const game = setCell(start, 7, 'mark')
    expect(game.queens).toEqual(start.queens)
    expect([...game.marks]).toEqual([7])
  })
})

describe('paintStroke', () => {
  const withPiece = toggleQueen(createGame(BLOCKS), 3)
  const withPieceAndMarks = toggleMark(withPiece, 4)

  it('marks a cell that holds nothing', () => {
    expect(cellState(paintStroke(createGame(BLOCKS), 2, 'mark'), 2)).toBe('mark')
  })

  it('erases a mark when the stroke started on one', () => {
    expect(cellState(paintStroke(withPieceAndMarks, 4, 'empty'), 4)).toBe('empty')
  })

  it('will not paint a mark over a piece', () => {
    // Dragging out a run of exclusions must not un-place a queen it crosses.
    const game = paintStroke(withPiece, 3, 'mark')
    expect(cellState(game, 3)).toBe('queen')
    expect(game.marks.has(3)).toBe(false)
  })

  it('will not erase over a piece either', () => {
    // The half that was missed first time. A stroke that starts on a marked
    // cell has the target 'empty', so guarding only 'mark' left this path
    // sweeping pieces off the board exactly as destructively.
    const game = paintStroke(withPieceAndMarks, 3, 'empty')
    expect(cellState(game, 3)).toBe('queen')
    expect(game.queens.has(3)).toBe(true)
  })

  it('leaves a crossed piece alone while still painting its neighbours', () => {
    let game = paintStroke(withPiece, 2, 'mark')
    game = paintStroke(game, 3, 'mark')
    game = paintStroke(game, 4, 'mark')
    expect(game.queens).toEqual(withPiece.queens)
    expect([...game.marks].sort((a, b) => a - b)).toEqual([2, 4])
  })

  it('is a no-op on a cell holding a piece, so the stroke adds no undo step', () => {
    expect(paintStroke(withPiece, 3, 'mark')).toBe(withPiece)
    expect(paintStroke(withPiece, 3, 'empty')).toBe(withPiece)
  })

  it('never places a piece, so a drag cannot solve the puzzle by accident', () => {
    const game = paintStroke(createGame(BLOCKS), 1, 'mark')
    expect(game.queens.size).toBe(0)
  })

  it('leaves a piece removable by clicking it', () => {
    const removed = cycleCell(withPiece, 3)
    expect(cellState(removed, 3)).toBe('empty')
  })
})

describe('cycleCell', () => {
  it('goes empty -> mark -> piece -> empty', () => {
    const start = createGame(BLOCKS)
    expect(cellState(start, 3)).toBe('empty')
    const marked = cycleCell(start, 3)
    expect(cellState(marked, 3)).toBe('mark')
    const placed = cycleCell(marked, 3)
    expect(cellState(placed, 3)).toBe('queen')
    expect(cellState(cycleCell(placed, 3), 3)).toBe('empty')
  })

  it('returns to exactly the starting state after three clicks', () => {
    const start = createGame(BLOCKS)
    const after = [3, 3, 3].reduce(cycleCell, start)
    expect(after.queens).toEqual(start.queens)
    expect(after.marks).toEqual(start.marks)
  })

  it('does not need a mark to already be there to place a piece', () => {
    // The second click promotes the mark the first click made, so this is the
    // ordinary "cross it out, then commit" path rather than a special case.
    const game = cycleCell(cycleCell(createGame(BLOCKS), 3), 3)
    expect(game.marks.has(3)).toBe(false)
    expect(game.queens.has(3)).toBe(true)
  })

  it('works the same on a star battle board', () => {
    // A star is stored as a queen internally, so the cycle has no notion of
    // puzzle type; this pins that so it cannot drift.
    const start = createGame(STAR_BLOCKS)
    expect(cellState(cycleCell(cycleCell(start, 0), 0), 0)).toBe('queen')
  })
})

describe('nextCellState', () => {
  it('reports the state a click would produce', () => {
    const start = createGame(BLOCKS)
    expect(nextCellState(start, 3)).toBe('mark')
    expect(nextCellState(cycleCell(start, 3), 3)).toBe('queen')
    expect(nextCellState(cycleCell(cycleCell(start, 3), 3), 3)).toBe('empty')
  })
})

describe('conflicts', () => {
  it('reports no conflicts for a clean game', () => {
    expect(conflicts(createGame(BLOCKS))).toEqual([])
  })

  it('reports only the pairs that actually conflict', () => {
    // (0,0) and (2,2): different rows, columns and regions, far apart.
    const game = toggleQueen(toggleQueen(createGame(BLOCKS), 0), 10)
    expect(conflicts(game)).toEqual([])
  })

  it('flags two queens in one row', () => {
    // (0,0) and (0,1)
    const game = toggleQueen(toggleQueen(createGame(BLOCKS), 0), 1)
    expect(conflicts(game)).toEqual([
      { rule: 'row', cells: [0, 1] },
    ])
  })

  it('flags two queens in one column', () => {
    // (0,3) region 1 and (3,3) region 3: same column, no shared row or region.
    const game = toggleQueen(toggleQueen(createGame(BLOCKS), 3), 15)
    expect(conflicts(game)).toEqual([
      { rule: 'column', cells: [3, 15] },
    ])
  })

  it('flags two queens sharing a region', () => {
    // (0,0) and (1,1) share region 0 but differ in row and column; they also
    // touch diagonally, and region outranks touch.
    const game = toggleQueen(toggleQueen(createGame(BLOCKS), 0), 5)
    expect(conflicts(game)).toEqual([
      { rule: 'region', cells: [0, 5] },
    ])
  })

  it('flags diagonally touching queens', () => {
    // (0,1) region 0 and (1,2) region 1: adjacent diagonally, no shared row,
    // column or region.
    const game = toggleQueen(toggleQueen(createGame(BLOCKS), 1), 6)
    expect(conflicts(game)).toEqual([
      { rule: 'touch', cells: [1, 6] },
    ])
  })

  it('reports all conflicts when three queens clash', () => {
    // 0=(0,0) and 5=(1,1) share region 0; 5 and 6=(1,2) share row 1.
    const game = toggleQueen(toggleQueen(toggleQueen(createGame(BLOCKS), 0), 5), 6)
    expect(conflicts(game)).toEqual([
      { rule: 'region', cells: [0, 5] },
      { rule: 'row', cells: [5, 6] },
    ])
  })

  it('orders a clash of row losers by ascending cells', () => {
    // 0=(0,0), 1=(0,1), 2=(0,2): three in row 0, pairs sorted by cells.
    const game = toggleQueen(toggleQueen(toggleQueen(createGame(BLOCKS), 2), 0), 1)
    expect(conflicts(game)).toEqual([
      { rule: 'row', cells: [0, 1] },
      { rule: 'row', cells: [0, 2] },
      { rule: 'row', cells: [1, 2] },
    ])
  })
})

describe('starsPerRow', () => {
  it('is 1 for queens, whatever the region capacities say', () => {
    expect(starsPerRow(BLOCKS)).toBe(1)
  })

  it('is the star count per row for a star battle', () => {
    expect(starsPerRow(STAR_BLOCKS)).toBe(2)
    expect(starsPerRow(STAR_BANDS)).toBe(2)
  })
})

describe('cellsEliminated', () => {
  it('covers the row, column, region and neighbouring cells of a corner queen', () => {
    // (0,0): row 0, column 0, region 0 (cells 0,1,4,5) and the corner's only
    // neighbours (cells 1,4,5).
    expect(cellsEliminated(BLOCKS, 0)).toEqual([0, 1, 2, 3, 4, 5, 8, 12])
  })

  it('covers all eight neighbours of a central queen', () => {
    // (1,2)
    expect(cellsEliminated(BLOCKS, 6)).toEqual([1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 14])
  })

  it('eliminates only the touching cells for a star', () => {
    // A star leaves its own row, column and region open to a second star, so
    // only the neighbours (1,4,5) are dead.
    expect(cellsEliminated(STAR_BLOCKS, 0)).toEqual([1, 4, 5])
    expect(cellsEliminated(STAR_BANDS, 27)).toEqual([18, 19, 20, 26, 28, 34, 35, 36])
  })
})

describe('placeQueenAutoMark', () => {
  it('places a queen and mounts X marks on everything it rules out', () => {
    const game = placeQueenAutoMark(createGame(BLOCKS), 0)
    expect(cellState(game, 0)).toBe('queen')
    const expectedMarks = [1, 2, 3, 4, 5, 8, 12]
    expect([...game.marks].sort((a, b) => a - b)).toEqual(expectedMarks)
  })

  it('accumulates marks across placements but never marks over a queen', () => {
    const first = placeQueenAutoMark(createGame(BLOCKS), 0)
    const game = placeQueenAutoMark(first, 5)
    expect([...game.queens].sort((a, b) => a - b)).toEqual([0, 5])
    // (0,0) stays a queen; everything placement 5 rules out is marked.
    expect([...game.marks].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 6, 7, 8, 9, 10, 12, 13])
  })

  it('takes the queen back on a second placement, leaving existing marks alone', () => {
    const first = placeQueenAutoMark(createGame(BLOCKS), 0)
    const game = placeQueenAutoMark(first, 0)
    expect(game.queens.size).toBe(0)
    expect([...game.marks].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 8, 12])
  })
})

describe('isSolved', () => {
  it('is false for an empty board and for a partial one', () => {
    expect(isSolved(createGame(BLOCKS))).toBe(false)
    expect(isSolved(toggleQueen(createGame(BLOCKS), 0))).toBe(false)
  })

  it('is false when all queens are placed but two conflict', () => {
    // (0,1) and (1,1) share column 1.
    const game = toggleQueen(toggleQueen(toggleQueen(toggleQueen(createGame(BLOCKS), 1), 7), 8), 13)
    expect(game.queens.size).toBe(4)
    expect(isSolved(game)).toBe(false)
  })

  it('is true for a valid complete solution', () => {
    const game = toggleQueen(
      toggleQueen(toggleQueen(toggleQueen(createGame(BLOCKS), 1), 7), 8),
      14,
    )
    expect(isSolved(game)).toBe(true)
  })

  it('wants size * starsPerRow stars, not size', () => {
    expect(starsPerRow(STAR_BANDS) * STAR_BANDS.size).toBe(16)
  })

  it('is true for a valid 2-star solution', () => {
    const game = STAR_BANDS_SOLUTION.reduce(
      (state, cell) => toggleQueen(state, cell),
      createGame(STAR_BANDS),
    )
    expect(game.queens.size).toBe(16)
    expect(conflicts(game)).toEqual([])
    expect(isSolved(game)).toBe(true)
  })

  it('is false for a 2-star board with 15 stars', () => {
    const game = STAR_BANDS_SOLUTION.slice(1).reduce(
      (state, cell) => toggleQueen(state, cell),
      createGame(STAR_BANDS),
    )
    expect(isSolved(game)).toBe(false)
  })
})

describe('conflicts with star battle capacities', () => {
  it('allows two stars in one row, column and region', () => {
    // (0,0) and (1,1) share region 0, which holds two stars, and they touch.
    const game = toggleQueen(toggleQueen(createGame(STAR_BLOCKS), 0), 5)
    // Same region but within capacity, so the only pair that still breaks a
    // rule is the touching one.
    expect(conflicts(game)).toEqual([{ rule: 'touch', cells: [0, 5] }])
  })

  it('allows two stars sharing a row when capacity allows', () => {
    // (0,0) and (0,3): same row and same band, both within capacity 2, and
    // three columns apart so they do not touch.
    const game = toggleQueen(toggleQueen(createGame(STAR_BLOCKS), 0), 3)
    expect(conflicts(game)).toEqual([])
  })

  it('flags a third star in a two-star row', () => {
    // (0,0), (0,1), (0,2): row 0 holds three, over its capacity of two.
    const game = [0, 1, 2].reduce((state, cell) => toggleQueen(state, cell), createGame(STAR_BLOCKS))
    expect(conflicts(game)).toContainEqual({ rule: 'row', cells: [0, 1] })
    expect(conflicts(game)).toContainEqual({ rule: 'row', cells: [0, 2] })
    expect(conflicts(game)).toContainEqual({ rule: 'row', cells: [1, 2] })
  })

  it('flags a third star in a two-star region', () => {
    // (0,0), (0,1) and (1,1) all sit in region 0, which holds two.
    const game = [0, 1, 5].reduce((state, cell) => toggleQueen(state, cell), createGame(STAR_BLOCKS))
    expect(conflicts(game)).toContainEqual({ rule: 'region', cells: [0, 1] })
    expect(conflicts(game)).toContainEqual({ rule: 'region', cells: [0, 5] })
  })

  it('still flags touching stars across a region boundary', () => {
    // (1,1) region 0 and (1,2) region 1: adjacent, and both regions have room.
    const game = toggleQueen(toggleQueen(createGame(STAR_BLOCKS), 5), 6)
    expect(conflicts(game)).toEqual([{ rule: 'touch', cells: [5, 6] }])
  })
})

describe('star battle parity with the engine', () => {
  // A real engine puzzle: `tools.generate --date 2026-10-04 --type star-battle`
  // (seed 894026858, generatorVersion 2) with the unique solution the engine's
  // own solver returns. The app must accept exactly what the engine calls solved.
  const ENGINE_PUZZLE = {
    id: '2026-10-04',
    type: 'star-battle',
    seed: 894026858,
    generatorVersion: 2,
    board: {
      size: 8,
      regions: [
        0, 0, 0, 0, 0, 0, 0, 1,
        0, 0, 0, 2, 1, 1, 1, 1,
        2, 2, 2, 2, 2, 3, 3, 1,
        4, 4, 4, 2, 3, 3, 3, 3,
        4, 4, 4, 4, 4, 4, 5, 3,
        4, 4, 4, 5, 5, 5, 5, 5,
        6, 6, 6, 5, 5, 5, 5, 5,
        6, 6, 6, 7, 7, 7, 7, 5,
      ],
      regionCapacity: [2, 2, 2, 2, 2, 2, 2, 2],
    },
  }
  const ENGINE_SOLUTION = [1, 3, 13, 15, 17, 19, 29, 31, 32, 34, 44, 46, 48, 50, 60, 62]

  it('parses and reads 2 stars per row', () => {
    const { board, puzzleType } = parsePuzzle(ENGINE_PUZZLE)
    expect(puzzleType).toBe('star-battle')
    expect(starsPerRow(board)).toBe(2)
  })

  it('accepts the engine solution as solved', () => {
    const { board } = parsePuzzle(ENGINE_PUZZLE)
    const game = ENGINE_SOLUTION.reduce(
      (state, cell) => toggleQueen(state, cell),
      createGame(board),
    )
    expect(conflicts(game)).toEqual([])
    expect(isSolved(game)).toBe(true)
  })

  it('rejects a swap of two stars that would leave a gap', () => {
    // Move the star at 1 to 2, which puts two stars in cell 2's region corner
    // and leaves region 0 with one; 15 stars is not a solution.
    const { board } = parsePuzzle(ENGINE_PUZZLE)
    const moved = [2, ...ENGINE_SOLUTION.slice(1)]
    const game = moved.reduce((state, cell) => toggleQueen(state, cell), createGame(board))
    expect(conflicts(game).length).toBeGreaterThan(0)
    expect(isSolved(game)).toBe(false)
  })

  it('flags a star placed next to another star', () => {
    const { board } = parsePuzzle(ENGINE_PUZZLE)
    // Cell 2 is diagonally adjacent to the solution's star at 1.
    const game = toggleQueen(toggleQueen(createGame(board), 1), 2)
    expect(conflicts(game)).toEqual([{ rule: 'touch', cells: [1, 2] }])
  })
})

describe('placeQueenAutoMark on star battle', () => {
  it('marks only the touching cells around a star', () => {
    const game = placeQueenAutoMark(createGame(STAR_BANDS), 27)
    expect(cellState(game, 27)).toBe('queen')
    expect([...game.marks].sort((a, b) => a - b)).toEqual([18, 19, 20, 26, 28, 34, 35, 36])
  })

  it('leaves a second star in the same row and band unmarked', () => {
    // (0,0) and (0,4) share row 0 and band 0, which holds two stars, and are
    // far enough apart not to touch.
    const game = placeQueenAutoMark(placeQueenAutoMark(createGame(STAR_BANDS), 0), 4)
    expect([...game.queens].sort((a, b) => a - b)).toEqual([0, 4])
    expect(conflicts(game)).toEqual([])
    expect(game.marks.has(4)).toBe(false)
  })
})

describe('formatTime', () => {
  it('formats durations as m:ss', () => {
    expect(formatTime(0)).toBe('0:00')
    expect(formatTime(94321)).toBe('1:34')
    expect(formatTime(2700000)).toBe('45:00')
  })

  it('never dips below 0:00', () => {
    expect(formatTime(-500)).toBe('0:00')
  })
})
describe('parsePuzzle difficulty band', () => {
  // A committed post-ramp Queens file: an 8x8 aimed at the Wednesday band.
  const RAMPED = {
    id: '2026-10-07',
    type: 'queens',
    seed: 1,
    generatorVersion: 1,
    board: { size: 3, regions: [0, 0, 1, 0, 1, 1, 0, 0, 2] },
    difficulty: 3,
  }

  it('reads the band the file records', () => {
    expect(parsePuzzle(RAMPED).difficulty).toBe(3)
  })

  it('reads every band in the scale', () => {
    for (const band of [1, 2, 3, 4, 5] as const) {
      expect(parsePuzzle({ ...RAMPED, difficulty: band }).difficulty).toBe(band)
    }
  })

  it('treats a file with no band as unknown, not as Easy', () => {
    // Every file published before the ramp lacks the field, and defaulting it to
    // 1 would put a labelled difficulty on a puzzle the engine never rated.
    const { difficulty: _omitted, ...withoutBand } = RAMPED
    expect(parsePuzzle(withoutBand).difficulty).toBeNull()
  })

  it('rejects a null band rather than storing one', () => {
    // The schema types `difficulty` as an integer, so an explicit null is a
    // malformed file, not an "unrated" board. Nothing ever writes it: absence is
    // how a pre-ramp file says "no band", and the engine omits the key entirely.
    expect(() => parsePuzzle({ ...RAMPED, difficulty: null })).toThrow(/difficulty/)
  })

  it('rejects a band outside the scale', () => {
    expect(() => parsePuzzle({ ...RAMPED, difficulty: 0 })).toThrow(/difficulty/)
    expect(() => parsePuzzle({ ...RAMPED, difficulty: 6 })).toThrow(/difficulty/)
  })
})
