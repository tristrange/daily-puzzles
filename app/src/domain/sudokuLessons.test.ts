import { expect, it } from 'vitest'
import certificates from '../../../docs/measurements/sudoku-lessons.json'
import { solveSudoku, sudokuSingle } from './sudoku'
import { nextSudokuStep } from './sudokuHints'
import { SUDOKU_LESSONS } from './sudokuLessons'

it.each(certificates.lessons)('teaches a sound $id restriction on an independently certified position', certificate => {
  const lesson = SUDOKU_LESSONS.find(lesson => lesson.id === certificate.id)
  expect(lesson).toBeDefined()
  if (!lesson) throw Error('Missing lesson')
  expect(solveSudoku(lesson.board)).toEqual({ kind: 'unique', cells: certificate.unique_solution })
  const masks = lesson.game.cells.map((value, cell) => value ? 1 << (value - 1) : lesson.game.notes[cell]!)
  expect(masks).toEqual(certificate.candidates)
  expect(lesson.step).toMatchObject({ cell: certificate.step.cell, before: certificate.step.before,
    after: certificate.step.after, rule: certificate.step.rule })
  expect(nextSudokuStep(masks, lesson.board.level)).toMatchObject(lesson.step)
  expect(lesson.support).toEqual(certificate.support)
  expect(lesson.support.every(cell => !sudokuSingle(masks[cell]!))).toBe(true)
  if (lesson.step.rule === 'locked-candidate') {
    // One shared candidate keeps this exercise distinct from a naked-pair lesson.
    expect(lesson.support.reduce((common, cell) => common & masks[cell]!, 511)).toBe(lesson.step.before & ~lesson.step.after)
  }
  for (const [cell, mask] of masks.entries()) expect(mask & (1 << (certificate.unique_solution[cell]! - 1))).not.toBe(0)
  expect(lesson.step.after & (1 << (certificate.unique_solution[lesson.step.cell]! - 1))).not.toBe(0)
})
