import { expect, it } from 'vitest'
import { isSolved } from './game'
import { QUEENS_LESSONS } from './queensLessons'
import solutions from './queensLessonSolutions.json'

it('checks the reservations and every accepted deduction', () => {
  expect(QUEENS_LESSONS).toHaveLength(9)
  for (const lesson of QUEENS_LESSONS) {
    const { board, game } = lesson, n = board.size
    const solution = Object.entries(solutions).find(([id]) => id === lesson.source)?.[1]
    if (!solution) throw Error('Missing verified solution')
    expect(isSolved({ board, queens: new Set(solution), marks: new Set() })).toBe(true)
    expect([...game.queens].every(cell => solution.includes(cell))).toBe(true)
    expect([...game.marks].every(cell => !solution.includes(cell))).toBe(true)
    const touch = (a: number, b: number) => Math.max(Math.abs(Math.floor(a / n) - Math.floor(b / n)), Math.abs(a % n - b % n)) <= 1
    const candidates = Array.from({ length: n * n }, (_, cell) => cell).filter(cell => !game.marks.has(cell) && !game.queens.has(cell)
      && ![...game.queens].some(queen => Math.floor(queen / n) === Math.floor(cell / n) || queen % n === cell % n || board.regionAt(queen) === board.regionAt(cell) || touch(queen, cell)))
    const regions = lesson.regions
    expect(regions).toHaveLength(2)
    const options = regions.map(region => candidates.filter(cell => board.regionAt(cell) === region))
    expect(options).toEqual(lesson.options)
    for (const group of options) {
      expect(group.length).toBeGreaterThan(1)
      const homes = [...new Set(group.map(cell => lesson.axis === 'row' ? Math.floor(cell / n) : cell % n))].sort((a, b) => a - b)
      expect(homes).toEqual(lesson.homes)
    }
    const victims = candidates.filter(cell => !regions.includes(board.regionAt(cell))
      && lesson.homes.includes(lesson.axis === 'row' ? Math.floor(cell / n) : cell % n))
    if (lesson.technique === 'pair') {
      expect(lesson.answers).toEqual(victims.filter(cell => Math.floor(cell / n) === lesson.row))
    } else if (lesson.technique === 'chain') {
      const row = candidates.filter(cell => Math.floor(cell / n) === lesson.row)
      expect(row.length).toBeGreaterThan(1)
      expect(lesson.removed).toEqual(row.filter(cell => victims.includes(cell)))
      expect(lesson.answers).toEqual(row.filter(cell => !victims.includes(cell)))
      expect(lesson.answers).toHaveLength(1)
    } else {
      const pairs = options[0]!.flatMap(a => options[1]!.filter(b => Math.floor(a / n) !== Math.floor(b / n) && a % n !== b % n && !touch(a, b)).map(b => [a, b]))
      const normalize = (values: number[][]) => values.map(value => value.join(',')).sort()
      expect(normalize(pairs)).toEqual(normalize(lesson.pairs))
      expect(pairs.length).toBeGreaterThan(1)
      const valid = candidates.filter(cell => Math.floor(cell / n) === lesson.row && !victims.includes(cell) && !regions.includes(board.regionAt(cell))
        && !options.some(group => group.every(other => touch(cell, other))) && pairs.every(([a, b]) => touch(cell, a!) || touch(cell, b!)))
      expect(lesson.answers).toEqual(valid)
    }
    for (const cell of lesson.answers) expect(solution.includes(cell)).toBe(lesson.action === 'queen')
  }
})
