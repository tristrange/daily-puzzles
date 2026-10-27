import { expect, it } from 'vitest'
import certificates from '../../../docs/measurements/sudoku-lessons.json'
import positions from '../data/sudoku-lessons.json'
import { solveSudoku, SUDOKU_UNITS, sudokuDigits, sudokuSingle } from './sudoku'
import { deduceSudoku, nextSudokuStep } from './sudokuHints'
import { SUDOKU_LESSONS, SUDOKU_TECHNIQUES } from './sudokuLessons'

it.each(certificates.lessons)('teaches a sound $id restriction on an independently certified position', certificate => {
  const lesson = SUDOKU_LESSONS.find(lesson => lesson.id === certificate.id)
  expect(lesson).toBeDefined()
  if (!lesson) throw Error('Missing lesson')
  expect(solveSudoku(lesson.board)).toEqual({ kind: 'unique', cells: certificate.unique_solution })
  const masks = lesson.game.cells.map((value, cell) => value ? 1 << (value - 1) : lesson.game.notes[cell]!)
  expect(masks).toEqual(certificate.candidates)
  expect(lesson.step).toMatchObject({ cell: certificate.step.cell, before: certificate.step.before,
    after: certificate.step.after, rule: certificate.step.rule, group: certificate.step.group })
  const givens = Object.values(positions).flat().find(exercise => exercise.id === lesson.id)?.givens
  if (!givens) throw Error('Missing source givens')
  const original = { ...lesson.board, givens }
  expect(solveSudoku(original)).toEqual({ kind: 'unique', cells: certificate.unique_solution })
  expect(deduceSudoku(original, givens).steps.find(step => step.rule === certificate.step.rule)).toMatchObject(certificate.step)
  expect(nextSudokuStep(masks, lesson.board.level)).toMatchObject(lesson.step)
  expect(lesson.support).toEqual(certificate.support)
  expect(lesson.support.every(cell => !sudokuSingle(masks[cell]!))).toBe(true)
  if (lesson.id === 'locked-candidates') {
    expect(lesson.support.reduce((common, cell) => common & masks[cell]!, 511)).toBe(lesson.step.before & ~lesson.step.after)
  }
  for (const [cell, mask] of masks.entries()) expect(mask & (1 << (certificate.unique_solution[cell]! - 1))).not.toBe(0)
  expect(lesson.step.after & (1 << (certificate.unique_solution[lesson.step.cell]! - 1))).not.toBe(0)
})

it('covers exactly the ordered runtime givens and independent certificates', () => {
  const ids = ['locked-candidates', 'pairs', 'hidden-pairs', 'naked-triples', 'x-wing']
  const exercises = Object.values(positions).flat()
  expect(SUDOKU_TECHNIQUES.map(technique => technique.id)).toEqual([...ids, 'xy-wing', 'swordfish'])
  expect(SUDOKU_TECHNIQUES.map(technique => technique.exercises[0]?.id)).toEqual([...ids, 'xy-wing', 'swordfish'])
  expect(SUDOKU_TECHNIQUES.every(technique => technique.exercises.length === 3)).toBe(true)
  expect(Object.keys(positions)).toEqual(ids)
  expect(SUDOKU_LESSONS).toHaveLength(21)
  expect(SUDOKU_LESSONS.slice(0, 15).map(lesson => lesson.id)).toEqual(exercises.map(exercise => exercise.id))
  expect(certificates.lessons.map(lesson => lesson.id)).toEqual(exercises.map(exercise => exercise.id))
  expect(new Set(exercises.map(exercise => exercise.id)).size).toBe(15)
  expect(new Set(exercises.map(exercise => JSON.stringify(exercise.givens))).size).toBe(15)
  expect(new Set(SUDOKU_LESSONS.map(lesson => JSON.stringify(lesson.game))).size).toBe(21)
  for (const technique of SUDOKU_TECHNIQUES) {
    expect(technique.exercises.map(exercise => exercise.guidance)).toEqual(['guided', 'practice', 'practice'])
  }
})

it('shows both hidden-pair cells and every cell in the varied triple', () => {
  const hidden = SUDOKU_LESSONS.find(lesson => lesson.id === 'hidden-pairs')!
  const triple = SUDOKU_LESSONS.find(lesson => lesson.id === 'naked-triples')!
  const hiddenMasks = hidden.game.notes
  expect(sudokuDigits(hidden.step.after)).toHaveLength(2)
  expect(hidden.support).toContain(hidden.step.cell)
  expect(hidden.step.group).toEqual(expect.arrayContaining([...hidden.support]))
  for (const digit of sudokuDigits(hidden.step.after)) {
    expect(hidden.step.group.filter(cell => hiddenMasks[cell]! & (1 << (digit - 1)))).toEqual(hidden.support)
  }
  expect(hidden.support).toHaveLength(2)
  const masks = triple.game.notes
  expect(triple.support).toEqual(triple.step.group)
  expect(new Set(triple.support).size).toBe(3)
  expect(SUDOKU_UNITS.some(unit => [...triple.support, triple.step.cell].every(cell => unit.includes(cell)))).toBe(true)
  expect(sudokuDigits(triple.support.reduce((union, cell) => union | masks[cell]!, 0))).toHaveLength(3)
  expect(new Set(triple.support.map(cell => masks[cell])).size).toBeGreaterThan(1)
  expect(sudokuDigits(triple.step.after).length).toBeGreaterThanOrEqual(2)
})
