import { expect, it } from 'vitest'
import { solveKillerSudoku } from './killerSudokuHints'
import { KILLER_FORTY_FIVE_LESSONS, fortyFiveExcluded, fortyFiveFacts } from './killerFortyFiveLessons'

function permutations(values: readonly number[]): number[][] {
  if (values.length === 0) return [[]]
  return values.flatMap((value, index) =>
    permutations(values.filter((_, i) => i !== index)).map(rest => [value, ...rest]),
  )
}

function unitCells(kind: 'row' | 'column' | 'box', index: number): number[] {
  return Array.from({ length: 81 }, (_, cell) => cell).filter(cell => {
    const row = Math.floor(cell / 9), column = cell % 9
    return kind === 'row' ? row === index : kind === 'column' ? column === index
      : Math.floor(row / 3) * 3 + Math.floor(column / 3) === index
  })
}

function sharesUnit(a: number, b: number): boolean {
  return Math.floor(a / 9) === Math.floor(b / 9) || a % 9 === b % 9
    || Math.floor(a / 27) === Math.floor(b / 27) && Math.floor(a % 9 / 3) === Math.floor(b % 9 / 3)
}

it('provides four distinct, increasingly varied 45-rule exercises', () => {
  expect(KILLER_FORTY_FIVE_LESSONS).toHaveLength(4)
  expect(new Set(KILLER_FORTY_FIVE_LESSONS.map(lesson => lesson.id)).size).toBe(4)
  expect(new Set(KILLER_FORTY_FIVE_LESSONS.map(lesson => lesson.unit.kind))).toEqual(new Set(['row', 'column', 'box']))
  expect(new Set(KILLER_FORTY_FIVE_LESSONS.map(lesson => lesson.side))).toEqual(new Set(['innie', 'outie']))
})

it.each(KILLER_FORTY_FIVE_LESSONS)('$id proves the stated deduction independently', lesson => {
  const { board, cageIndex } = lesson, cage = board.cages[cageIndex]!
  const unit = new Set(unitCells(lesson.unit.kind, lesson.unit.index))
  const touching = board.cages.filter(item => item.cells.some(cell => unit.has(cell)))
  const crossing = touching.filter(item => item.cells.some(cell => !unit.has(cell)))
  expect(crossing).toEqual([cage])
  const inside = cage.cells.filter(cell => unit.has(cell))
  const outside = cage.cells.filter(cell => !unit.has(cell))
  const subtotal = lesson.side === 'innie'
    ? 45 - touching.filter(item => item !== cage).reduce((sum, item) => sum + item.sum, 0)
    : touching.reduce((sum, item) => sum + item.sum, 0) - 45
  const subset = lesson.side === 'innie' ? inside : outside
  const facts = fortyFiveFacts(lesson)
  expect(facts.targetCells).toEqual(subset)
  expect(facts.targetTotal).toBe(subtotal)
  expect(inside.length).toBeGreaterThanOrEqual(2)
  expect(outside.length).toBeGreaterThanOrEqual(2)

  const excluded: number[] = [], possible: number[] = []
  for (let mask = 1; mask < 512; mask++) {
    const digits = Array.from({ length: 9 }, (_, i) => i + 1).filter(digit => mask & (1 << (digit - 1)))
    if (digits.length !== cage.cells.length || digits.reduce((sum, digit) => sum + digit, 0) !== cage.sum) continue
    const assignments = permutations(digits)
    const fits = assignments.some(values => cage.cells.reduce(
      (sum, cell, index) => sum + (subset.includes(cell) ? values[index]! : 0), 0,
    ) === subtotal)
    ;(fits ? possible : excluded).push(mask)
  }
  expect(fortyFiveExcluded(lesson)).toEqual(expect.arrayContaining(excluded))
  expect(fortyFiveExcluded(lesson)).toHaveLength(excluded.length)
  expect(excluded.length).toBeGreaterThan(0)
  expect(possible.length).toBeGreaterThan(1)

  // At least one eliminated set still fits the visible givens alone.
  expect(excluded.some(mask => {
    const digits = Array.from({ length: 9 }, (_, i) => i + 1).filter(digit => mask & (1 << (digit - 1)))
    return permutations(digits).some(values => cage.cells.every((cell, index) =>
      board.givens.every((given, other) => !given || !sharesUnit(cell, other) || given !== values[index]),
    ))
  })).toBe(true)

  const solved = solveKillerSudoku(board)
  expect(solved.kind).toBe('unique')
  if (solved.kind !== 'unique') return
  const actual = cage.cells.reduce((mask, cell) => mask | (1 << (solved.cells[cell]! - 1)), 0)
  expect(excluded).not.toContain(actual)
})
