import { expect, it } from 'vitest'
import raw from '../data/sudoku-previews.json'
import proof from '../../../docs/measurements/sudoku-preview.json'
import { createSudokuGame, editSudoku, isSudokuSolved, parseSudokuBoards, solveSudoku, sudokuConflicts } from './sudoku'

const boards = parseSudokuBoards(raw)
it('independently finds the certified unique solution of each preview', () => {
  for (const [index, board] of boards.entries()) {
    expect(solveSudoku(board)).toEqual({ kind: 'unique', cells: proof.samples[index]!.solution })
    expect(isSudokuSolved(board, proof.samples[index]!.solution)).toBe(true)
    expect(isSudokuSolved(board, board.givens)).toBe(false)
  }
  expect(solveSudoku(boards[0]!, 0).kind).toBe('incomplete')
  expect(solveSudoku({ ...boards[0]!, givens: Array(81).fill(0) }).kind).toBe('multiple')
})

it('rejects malformed definitions and duplicate identities or givens', () => {
  for (const givens of [[], [...raw[0]!.givens.slice(1), true], Array(81).fill(1)]) {
    expect(() => parseSudokuBoards([{ ...raw[0], givens }, ...raw.slice(1)])).toThrow()
  }
  expect(() => parseSudokuBoards([raw[0], raw[0], raw[2]])).toThrow()
  expect(() => parseSudokuBoards([{ ...raw[0], level: 'expert' }, ...raw.slice(1)])).toThrow()
})

it('protects givens and keeps candidate notes separate from values and completion', () => {
  const board = boards[0]!, initial = createSudokuGame(board), cell = board.givens.indexOf(0)
  const given = board.givens.findIndex(Boolean)
  expect(editSudoku(board, initial, given, 9)).toBe(initial)
  const noted = editSudoku(board, initial, cell, 9, true)
  expect(noted.notes[cell]).toBe(256)
  expect(noted.cells[cell]).toBe(0)
  const entered = editSudoku(board, noted, cell, board.givens[given]!)
  expect(entered.notes[cell]).toBe(0)
  expect(editSudoku(board, entered, cell, 2, true)).toBe(entered)
  expect(sudokuConflicts(Array(81).fill(1)).size).toBe(81)
  expect(editSudoku(board, entered, cell, 0).cells[cell]).toBe(0)
})
