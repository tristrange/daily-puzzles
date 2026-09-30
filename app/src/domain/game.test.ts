/**
 * Player state transitions and queen-conflict detection.
 *
 * The conflict rules mirror the puzzle's constraints: no two queens may share a
 * row, column or region, and no two may touch (diagonals included). Rule
 * precedence is row > column > region > touch so a pair is reported under the
 * most specific rule that applies.
 */

import { describe, expect, it } from 'vitest'
import { Board } from './board'
import {
  cellState,
  clearCell,
  conflicts,
  createGame,
  toggleMark,
  toggleQueen,
} from './game'

const BLOCKS = new Board(4, [
  0, 0, 1, 1,
  0, 0, 1, 1,
  2, 2, 3, 3,
  2, 2, 3, 3,
], [1, 1, 1, 1], 'queens')

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