import { expect, it } from 'vitest'
import raw from '../data/killer-sudoku-previews.json'
import certificate from '../../../docs/measurements/killer-sudoku-preview.json'
import { createSudokuGame, isSudokuSolved, SUDOKU_PEERS } from './sudoku'
import { editKillerSudoku, isKillerSolved, killerConflicts, parseKillerPreviews } from './killerSudoku'

const boards = parseKillerPreviews(raw)

it.each(boards)('$id has a complete valid certified solution', board => {
  const solution = certificate.samples.find(sample => sample.id === board.id)!.solution
  expect(isKillerSolved(board, solution)).toBe(true)
  expect(board.cages.flatMap(cage => cage.cells).sort((a, b) => a - b)).toEqual(Array.from({ length: 81 }, (_, i) => i))
})

it('requires cage totals in addition to ordinary Sudoku rules', () => {
  const board = { ...boards[0]!, givens: Array<number>(81).fill(0) }
  const solution = certificate.samples[0]!.solution.map(value => value === 1 ? 2 : value === 2 ? 1 : value)
  expect(isSudokuSolved(board, solution)).toBe(true)
  expect(isKillerSolved(board, solution)).toBe(false)
  expect(killerConflicts(board, solution).size).toBeGreaterThan(0)
})

it('flags repeats across a cage even when they are not Sudoku peers and clears related notes', () => {
  const board = boards[0]!, cage = board.cages.find(c => c.cells.includes(6) && c.cells.includes(14))!
  expect(cage).toBeDefined()
  expect(SUDOKU_PEERS[6]).not.toContain(14)
  const original = createSudokuGame(board), notes = [...original.notes]
  notes[14] = 1 << 2
  const placed = editKillerSudoku(board, { ...original, notes }, 6, 3)
  expect(placed.notes[14]).toBe(0)
  const duplicate = editKillerSudoku(board, placed, 14, 3)
  expect(killerConflicts(board, duplicate.cells).has(6)).toBe(true)
  expect(killerConflicts(board, duplicate.cells).has(14)).toBe(true)
})

it('rejects malformed, disconnected or overlapping cages', () => {
  expect(() => parseKillerPreviews([{ ...raw[0], cages: raw[0]!.cages.slice(1) }])).toThrow()
  expect(() => parseKillerPreviews([{ ...raw[0], cages: [...raw[0]!.cages, raw[0]!.cages[0]] }])).toThrow()
  const cages = raw[0]!.cages.map((cage, i) => i === 0 ? { ...cage, cells: [0, 80] } : cage)
  expect(() => parseKillerPreviews([{ ...raw[0], cages }])).toThrow()
})

it('flags an overfilled or completed incorrect cage', () => {
  const board = boards[0]!, cells = [...board.givens]
  cells[0] = 8; cells[9] = 9 // The two-cell cage totals 13, not 17.
  expect(killerConflicts(board, cells).has(0)).toBe(true)
  expect(killerConflicts(board, cells).has(9)).toBe(true)
})

it('lists all distinct digit combinations without depending on the solution', async () => {
  const { killerCombinations } = await import('./killerSudoku')
  const { sudokuDigits } = await import('./sudoku')
  const combinations = (sum: number, size: number) => killerCombinations({ sum, cells: Array.from({ length: size }, (_, i) => i) }).map(sudokuDigits)
  expect(combinations(17, 2)).toEqual([[8, 9]])
  expect(combinations(15, 2)).toEqual([[6, 9], [7, 8]])
  expect(combinations(10, 4)).toEqual([[1, 2, 3, 4]])
})
