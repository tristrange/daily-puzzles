import { expect, it } from 'vitest'
import certificates from '../../../docs/measurements/sudoku-advanced-lessons.json'
import positions from '../data/sudoku-advanced-lessons.json'
import { solveSudoku, SUDOKU_COLUMNS, SUDOKU_PEERS, SUDOKU_ROWS, sudokuDigits } from './sudoku'
import { SUDOKU_LESSONS } from './sudokuLessons'

it.each(certificates.lessons)('uses a uniquely solvable, independently prepared position for $id', certificate => {
  const lesson = SUDOKU_LESSONS.find(item => item.id === certificate.id)!
  const exercise = [...positions['xy-wing'], ...positions.swordfish].find(item => item.id === certificate.id)!
  expect(solveSudoku({ ...lesson.board, givens: exercise.givens })).toEqual({ kind: 'unique', cells: certificate.unique_solution })
  const masks = lesson.game.cells.map((value, cell) => value ? 1 << (value - 1) : lesson.game.notes[cell]!)
  expect(masks).toEqual(certificate.candidates)
  masks.forEach((mask, cell) => expect(mask & (1 << (certificate.unique_solution[cell]! - 1))).not.toBe(0))
  expect(lesson.step.after).toBe(lesson.step.before & ~(1 << (exercise.digit - 1)))
  expect(lesson.step.after & (1 << (certificate.unique_solution[exercise.cell]! - 1))).not.toBe(0)
})

it.each(positions['xy-wing'])('$id forms an XY-Wing that eliminates the shared digit', exercise => {
  const lesson = SUDOKU_LESSONS.find(item => item.id === exercise.id)!
  const masks = lesson.game.notes
  const [a, b] = exercise.wings as [number, number]
  const pivot = masks[exercise.pivot]!, first = masks[a]!, second = masks[b]!, digit = 1 << (exercise.digit - 1)
  expect([pivot, first, second].map(mask => sudokuDigits(mask).length)).toEqual([2, 2, 2])
  expect(first & second).toBe(digit)
  expect(pivot & digit).toBe(0)
  expect(sudokuDigits(pivot & first)).toHaveLength(1)
  expect(sudokuDigits(pivot & second)).toHaveLength(1)
  expect((pivot & first) | (pivot & second)).toBe(pivot)
  expect(SUDOKU_PEERS[exercise.pivot]).toEqual(expect.arrayContaining([a, b]))
  expect(SUDOKU_PEERS[a]).not.toContain(b)
  expect(SUDOKU_PEERS[exercise.cell]).toEqual(expect.arrayContaining([a, b]))
  expect(lesson.support).toEqual([exercise.pivot, a, b])
})

it.each(positions.swordfish)('$id reserves three crossing lines for its digit', exercise => {
  const lesson = SUDOKU_LESSONS.find(item => item.id === exercise.id)!
  const masks = lesson.game.cells.map((value, cell) => value ? 1 << (value - 1) : lesson.game.notes[cell]!)
  const source = exercise.axis === 'row' ? SUDOKU_ROWS : SUDOKU_COLUMNS
  const crossing = exercise.axis === 'row' ? SUDOKU_COLUMNS : SUDOKU_ROWS
  const bit = 1 << (exercise.digit - 1)
  const places = exercise.lines.map(line => source[line]!.filter(cell => masks[cell]! & bit))
  expect(places.every(cells => cells.length >= 2 && cells.length <= 3 && cells.every(cell => lesson.game.cells[cell] === 0))).toBe(true)
  expect(places.flat().every(cell => exercise.offsets.some(offset => crossing[offset]!.includes(cell)))).toBe(true)
  expect(exercise.offsets.every(offset => places.flat().some(cell => crossing[offset]!.includes(cell)))).toBe(true)
  expect(exercise.lines.every(line => !source[line]!.includes(exercise.cell))).toBe(true)
  expect(exercise.offsets.some(offset => crossing[offset]!.includes(exercise.cell))).toBe(true)
  expect(lesson.support).toEqual(places.flat())
  // Every possible placement in the source lines occupies all three crossing lines.
  const choices = places.map(cells => cells.map(cell => exercise.offsets.find(offset => crossing[offset]!.includes(cell))!))
  const matchings = choices[0]!.flatMap(a => choices[1]!.flatMap(b => choices[2]!.map(c => [a, b, c])))
    .filter(offsets => new Set(offsets).size === 3)
  expect(matchings.length).toBeGreaterThan(0)
  expect(matchings.every(offsets => exercise.offsets.every(offset => offsets.includes(offset)))).toBe(true)
})
