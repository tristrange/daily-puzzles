import { describe, expect, it } from 'vitest'

import { Board, type PuzzleType } from './board'

const byValue = (a: number, b: number): number => a - b

function makeBoard(
  size: number,
  regions: readonly number[],
  regionCapacity: readonly number[],
  puzzleType: PuzzleType = 'queens',
): Board {
  return new Board(size, regions, regionCapacity, puzzleType)
}

const rowPartition = (size: number): number[] =>
  Array.from({ length: size }, (_, row) => row).flatMap((region) => Array<number>(size).fill(region))

describe('board structure', () => {
  it('accepts one region per row', () => {
    expect(makeBoard(5, rowPartition(5), [1, 1, 1, 1, 1]).regionCount).toBe(5)
  })

  it('takes width and height from size', () => {
    // The rectangular-grid vocabulary, on a board that is square by definition. A
    // third game that is not square adopts these names instead of inventing its
    // own, which is the whole reason they exist. `Board` itself stays square, so
    // these are equal to `size` today and `validateBoard` says so explicitly.
    const board = makeBoard(4, rowPartition(4), [1, 1, 1, 1])
    expect(board.width).toBe(4)
    expect(board.height).toBe(4)
    expect(board.width).toBe(board.size)
    expect(board.height).toBe(board.size)
    expect(board.cellCount).toBe(board.width * board.height)
  })

  it('rejects a region array of the wrong length', () => {
    expect(() => makeBoard(4, [0, 0, 0, 0], [1, 1, 1, 1])).toThrow(/expected 16/)
  })

  it('rejects region ids with a gap', () => {
    const regions = [0, 0, 0, 0, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4]
    expect(() => makeBoard(4, regions, [1, 1, 1, 1, 1])).toThrow(/no gaps/)
  })

  it('rejects a disconnected region', () => {
    const regions = [0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1]
    expect(() => makeBoard(4, regions, [1, 1], 'star-battle')).toThrow(/not orthogonally connected/)
  })

  it('rejects queens without one region per row', () => {
    expect(() => makeBoard(4, [...Array<number>(4).fill(0), ...Array<number>(4).fill(1), ...Array<number>(8).fill(2)], [1, 1, 1])).toThrow(
      /exactly 4 regions/,
    )
  })

  it('rejects a queens capacity above one', () => {
    expect(() => makeBoard(4, rowPartition(4), [1, 1, 2, 1])).toThrow(/capacity of exactly 1/)
  })

  it('rejects a capacity larger than the region', () => {
    // Region 1 holds two cells, so a capacity of three cannot be met.
    expect(() => makeBoard(2, [0, 0, 1, 1], [1, 3], 'star-battle')).toThrow(/capacity 3 outside/)
  })
})

describe('regions may interlock', () => {
  // Regions are only required to be 4-connected. An earlier version also
  // rejected diagonal self-contact, which is degenerate: a 4-connected path that
  // turns puts two cells diagonally adjacent, so every region would have had to
  // be a straight line. These two cases are the regression guard, and they use
  // the same boards as `engine/tests/test_board.py` so both sides must agree.
  it('accepts a region that touches itself diagonally', () => {
    const regions = [0, 0, 1, 1, 0, 0, 1, 1, 2, 2, 3, 3, 2, 2, 3, 3]
    expect(makeBoard(4, regions, [1, 1, 1, 1]).regionCount).toBe(4)
  })

  it('accepts a nine-cell blob region', () => {
    const regions = [2, 2, 2, 2, 3, 2, 2, 2, 3, 2, 2, 2, 3, 0, 1, 1]
    const board = makeBoard(4, regions, [1, 1, 1, 1])
    expect(board.regionCount).toBe(4)
    expect([...board.cellsOfRegion(2)]).toEqual([0, 1, 2, 3, 5, 6, 7, 9, 10, 11])
  })
})

describe('geometry', () => {
  const board = makeBoard(3, rowPartition(3), [1, 1, 1])

  it('reports orthogonal neighbours of a corner', () => {
    expect([...board.orthogonalNeighbours(board.index(0, 0))].sort(byValue)).toEqual([1, 3])
  })

  it('reports diagonal neighbours of the centre', () => {
    expect([...board.diagonalNeighbours(board.index(1, 1))].sort(byValue)).toEqual([0, 2, 6, 8])
  })

  it('round-trips index and coords', () => {
    for (let cell = 0; cell < board.cellCount; cell += 1) {
      const { row, col } = board.coords(cell)
      expect(board.index(row, col)).toBe(cell)
    }
  })
})
