import { expect, it } from 'vitest'
import raw from '../data/killer-sudoku-previews.json'
import certificate from '../../../docs/measurements/killer-sudoku-preview.json'
import { createSudokuGame, SUDOKU_ROWS, sudokuSingle } from './sudoku'
import { isKillerSolved, killerCombinations, parseKillerPreviews } from './killerSudoku'
import { applyKillerSudokuHint, findKillerSudokuHint, solveKillerSudoku } from './killerSudokuHints'

const boards = parseKillerPreviews(raw)

it.each(boards)('$id verifies uniqueness and produces a sound cage hint', board => {
  const solution = certificate.samples.find(sample => sample.id === board.id)!.solution
  expect(solveKillerSudoku(board)).toEqual({ kind: 'unique', cells: solution })
  const game = createSudokuGame(board), result = findKillerSudokuHint(board, game)
  expect(result.kind).toBe('hint')
  if (result.kind !== 'hint') throw Error('Expected a hint')
  expect(result.hint.candidates & (1 << (solution[result.hint.cell]! - 1))).not.toBe(0)
  expect(result.hint.reasons[0]).toContain('cage')
  const next = applyKillerSudokuHint(board, game, result.hint)
  expect(next).not.toBe(game)
  expect(sudokuSingle(result.hint.candidates) ? next.cells[result.hint.cell] : next.notes[result.hint.cell]).toBe(sudokuSingle(result.hint.candidates) ? solution[result.hint.cell] : result.hint.candidates)
  expect(applyKillerSudokuHint(board, next, result.hint)).toBe(next)
})

it('never calls a budget-limited search a unique solution', () => {
  expect(solveKillerSudoku(boards[0]!, 0)).toEqual({ kind: 'incomplete' })
})

it('warns about a wrong entry before revealing any deduction, without using notes as proof', () => {
  const board = boards[0]!, solution = certificate.samples[0]!.solution, game = createSudokuGame(board)
  const cell = board.givens.indexOf(0), cells = [...game.cells]
  cells[cell] = solution[cell]! % 9 + 1
  expect(findKillerSudokuHint(board, { ...game, cells })).toEqual({ kind: 'mistake', cell })
  const notes = game.notes.map((value, i) => game.cells[i] ? value : 1)
  const hint = findKillerSudokuHint(board, { ...game, notes })
  expect(hint.kind).toBe('hint')
  if (hint.kind === 'hint') expect(hint.hint.candidates & (1 << (solution[hint.hint.cell]! - 1))).not.toBe(0)
})


it('distinguishes multiple solutions and contradictory givens', () => {
  const board = { ...boards[0]!, givens: Array<number>(81).fill(0), cages: SUDOKU_ROWS.map(cells => ({ cells, sum: 45 })) }
  expect(solveKillerSudoku(board)).toEqual({ kind: 'multiple' })
  const givens = [...board.givens]; givens[0] = givens[1] = 1
  expect(solveKillerSudoku({ ...board, givens })).toEqual({ kind: 'none' })
})


it.each(boards)('$id can progress through explained hints without guessing', board => {
  const solution = certificate.samples.find(sample => sample.id === board.id)!.solution
  let game = createSudokuGame(board)
  for (let step = 0; step < 150 && !isKillerSolved(board, game.cells); step++) {
    const result = findKillerSudokuHint(board, game)
    expect(result.kind).toBe('hint')
    if (result.kind !== 'hint') break
    expect(result.hint.candidates & (1 << (solution[result.hint.cell]! - 1))).not.toBe(0)
    game = applyKillerSudokuHint(board, game, result.hint)
  }
  expect(isKillerSolved(board, game.cells)).toBe(true)
})


it('does not use crossed-out combinations as hint evidence', () => {
  const board = boards[0]!, game = createSudokuGame(board)
  const marked = { ...game, excludedCageCombinations: board.cages.map(killerCombinations) }
  const original = findKillerSudokuHint(board, game), withMarks = findKillerSudokuHint(board, marked)
  expect(original.kind).toBe('hint')
  expect(withMarks.kind).toBe('hint')
  if (original.kind === 'hint' && withMarks.kind === 'hint') {
    expect(withMarks.hint.cell).toBe(original.hint.cell)
    expect(withMarks.hint.candidates).toBe(original.hint.candidates)
    expect(applyKillerSudokuHint(board, marked, withMarks.hint).excludedCageCombinations).toEqual(marked.excludedCageCombinations)
  }
})
