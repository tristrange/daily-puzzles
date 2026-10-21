import { expect, it } from 'vitest'
import cases from '../../../conformance/sudoku-preview/techniques.json'
import raw from '../data/sudoku-previews.json'
import playtest from './fixtures/sudoku-hard-playtest.json'
import proof from '../../../docs/measurements/sudoku-preview.json'
import { createSudokuGame, editSudoku, parseSudokuBoards, type SudokuLevel } from './sudoku'
import { deduceSudoku, findSudokuHint, nextSudokuStep, applySudokuHint } from './sudokuHints'

const boards = parseSudokuBoards(raw)
it('matches independent shared rule positions, including all advanced techniques', () => {
  for (const item of cases) {
    const masks = Array<number>(81).fill(511)
    for (const [cell, mask] of item.changes) masks[cell!] = mask!
    expect(nextSudokuStep(masks, item.level as SudokuLevel)).toMatchObject({ cell: item.cell, after: item.after, rule: item.rule })
  }
})

it('replays sound traces and honest bands on the three independently verified boards', () => {
  const levels = ['easy', 'medium', 'hard'] as const
  for (const [index, board] of boards.entries()) {
    const result = deduceSudoku(board, board.givens, board.level)
    expect(result.cells).toEqual(proof.samples[index]!.solution)
    expect(result.solved).toBe(true)
    if (index) expect(deduceSudoku(board, board.givens, levels[index - 1]!).solved).toBe(false)
    for (const [position, step] of result.steps.entries()) {
      expect(step.after & (1 << (proof.samples[index]!.solution[step.cell]! - 1))).not.toBe(0)
      expect(step.dependencies.every(i => i < position)).toBe(true)
      expect(step.reason.length).toBeGreaterThan(20)
    }
  }
})

it('checks mistakes before normal hints and ignores notes as proof', () => {
  const board = boards[0]!, game = createSudokuGame(board), cell = board.givens.indexOf(0)
  const value = proof.samples[0]!.solution[cell]!
  expect(findSudokuHint(board, editSudoku(board, game, cell, value % 9 + 1))).toMatchObject({ kind: 'mistake', cell })
  const result = findSudokuHint(board, editSudoku(board, game, cell, value % 9 + 1, true))
  expect(result.kind).toBe('hint')
  if (result.kind !== 'hint') throw Error('Expected explained hint')
  const applied = applySudokuHint(board, result.hint.source, result.hint)
  expect(applied).not.toBe(result.hint.source)
  expect(applySudokuHint(board, game, result.hint)).toBe(game)
})


it('keeps the reported long hint concise while retaining its supporting deductions', () => {
  const game = { cells: playtest.cells.flat(), notes: playtest.notes.flat().map(text => [...text].reduce((mask, digit) => mask | (1 << (Number(digit) - 1)), 0)) }
  const result = findSudokuHint(boards[2]!, game)
  expect(result.kind).toBe('hint')
  if (result.kind !== 'hint') throw Error('Expected hint')
  expect(result.hint.cell).toBe(59)
  expect(result.hint.candidates).toBe(79) // 1, 2, 3, 4, 7
  expect(result.hint.reasons).toHaveLength(1)
  expect(result.hint.reasons[0]).toContain('1, 2, 3, 4, 7')
  expect(result.hint.supportingReasons!.length).toBeLessThan(8)
  expect(result.hint.supportingReasons!.join(' ')).toContain('Row/column/box checks')
  expect(result.hint.supportingReasons!.join(' ')).toContain('R2C2: 4, 5')
  expect(result.hint.reasons.join(' ')).not.toContain('Remove ')
})
