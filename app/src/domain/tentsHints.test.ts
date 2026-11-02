import { expect, it } from 'vitest'
import daily from '../../public/puzzles/2026-10-21-tents.json'
import { parsePuzzle, isTentsPuzzle } from './puzzle'
import { createTentsGame, editTent, isTentsSolved, type TentsBoard, type TentsGame } from './tents'
import { findTentsHint } from './tentsHints'
import { tentsHintLesson } from './hintLessons'

const lineBoard: TentsBoard = { id: 'tents-preview-1', size: 8, trees: [8, 9, 10],
  rowClues: [2, 0, 1, 0, 0, 0, 0, 0], colClues: [1, 1, 1, 0, 0, 0, 0, 0] }
const undecided = [0, 1, 2, 16, 17, 18]
const prepared = (board: TentsBoard, open: number[]): TentsGame =>
  createTentsGame(board).map((_, cell) => board.trees.includes(cell) || open.includes(cell) ? 0 : 2)

it.each([['row', false], ['column', true]] as const)('compares all non-touching arrangements in a %s', (_, transpose) => {
  const flip = (cell: number) => (cell % 8) * 8 + Math.floor(cell / 8)
  const board = transpose ? { ...lineBoard, trees: lineBoard.trees.map(flip), rowClues: lineBoard.colClues, colClues: lineBoard.rowClues } : lineBoard
  const game = prepared(board, transpose ? undecided.map(flip) : undecided)
  const before = [...game]
  const result = findTentsHint(board, game)
  expect(result).toMatchObject({ kind: 'hint', hint: { cell: 0, value: 1 } })
  if (result.kind !== 'hint') throw Error('Expected an explained line deduction')
  expect(result.hint.reason).toContain(transpose ? 'Column 1' : 'Row 1')
  expect(result.hint.reason).toContain('arrangement')
  expect(tentsHintLesson(result.hint)?.path).toBe('/learn/tents/tents-line-arrangements-1')
  expect(result.hint.support).toContain(transpose ? 16 : 2)
  expect(game).toEqual(before)
})

it('warns about an impossible line before suggesting an otherwise basic move', () => {
  // Crossing out column 3 leaves two adjacent cells for the row's two tents.
  const game = prepared(lineBoard, [0, 1, 16, 17, 18])
  expect(findTentsHint(lineBoard, game)).toEqual({ kind: 'contradiction' })
})

it('finishes a published 10×10 board through explained moves without a solution lookup', () => {
  const puzzle = parsePuzzle(daily)
  if (!isTentsPuzzle(puzzle)) throw Error('Expected a Tents fixture')
  const board = puzzle.board
  let game = createTentsGame(board), arrangements = 0
  for (let step = 0; step < 100 && !isTentsSolved(board, game); step++) {
    const result = findTentsHint(board, game)
    expect(result.kind).toBe('hint')
    if (result.kind !== 'hint') break
    if (result.hint.reason.includes('arrangement')) arrangements++
    game = editTent(board, game, result.hint.cell, result.hint.value)
  }
  expect(arrangements).toBeGreaterThan(0)
  expect(isTentsSolved(board, game)).toBe(true)
})
