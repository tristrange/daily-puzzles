import { expect, it } from 'vitest'
import nuriPreviews from '../../../docs/measurements/nurikabe-preview.json'
import nuriDaily from '../../../docs/measurements/daily-nurikabe-launch.json'
import tentsReport from '../../../docs/measurements/tents-preview.json'
import advanced from '../data/tents-advanced-lessons.json'
import { GRID_LESSONS } from './gridLessons'
import { solveNurikabe } from './nurikabeSolve'
import { nextNurikabeDeduction } from './nurikabeHints'
import { editTent, tentsNeighbours, tentsLines } from './tents'
import { findTentsHint } from './tentsHints'

it('uses verified boards and teaches every sea-connection answer in the named row', () => {
  const lessons = GRID_LESSONS.filter(lesson => lesson.kind === 'nurikabe')
  expect(lessons).toHaveLength(3)
  for (const lesson of lessons) {
    if (lesson.kind !== 'nurikabe') throw Error('Expected Nurikabe')
    const source = [...nuriPreviews.samples, ...nuriDaily.samples].find(sample => sample.id === lesson.source)!
    expect(lesson.board.clues).toEqual(source.clues)
    const solution = solveNurikabe(lesson.board)
    expect(solution.kind).toBe('unique')
    if (solution.kind !== 'unique') throw Error('Expected a unique board')
    expect(lesson.state.every((mark, cell) => mark === 0 || mark === solution.cells[cell])).toBe(true)
    const hint = nextNurikabeDeduction(lesson.board, lesson.state)
    expect(hint).toMatchObject({ kind: 'deduction', rule: 'sea-connection', cell: lesson.answers[0]!.cell })
    const sea = lesson.state.flatMap((mark, cell) => mark === 1 ? [cell] : [])
    const size = lesson.board.size
    const disconnects = (target: number) => {
      const reached = new Set([sea[0]!]), queue = [sea[0]!]
      for (const cell of queue) {
        const row = Math.floor(cell / size), col = cell % size
        for (const [r, c] of [[row - 1, col], [row + 1, col], [row, col - 1], [row, col + 1]]) {
          if (r! < 0 || r! >= size || c! < 0 || c! >= size) continue
          const next = r! * size + c!
          if (next !== target && lesson.state[next] !== 2 && !reached.has(next)) { reached.add(next); queue.push(next) }
        }
      }
      return sea.some(cell => !reached.has(cell))
    }
    const answers = lesson.state.flatMap((mark, cell) => mark === 0 && Math.floor(cell / size) === lesson.line && disconnects(cell) ? [cell] : [])
    expect(lesson.answers.map(answer => answer.cell)).toEqual(answers)
    expect(answers.every(cell => solution.cells[cell] === 1)).toBe(true)
  }
})

it('teaches the full set of forced tents from each explained line arrangement', () => {
  const lessons = GRID_LESSONS.filter(lesson => lesson.kind === 'tents' && lesson.technique === 'arrangements')
  expect(lessons).toHaveLength(3)
  for (const lesson of lessons) {
    if (lesson.kind !== 'tents') throw Error('Expected Tents')
    const solution = tentsReport.samples.find(sample => sample.id === lesson.source)!.solution
    expect(lesson.state.every((mark, cell) => mark === 0 || (mark === 1) === solution.includes(cell))).toBe(true)
    const result = findTentsHint(lesson.board, lesson.state)
    expect(result.kind).toBe('hint')
    if (result.kind !== 'hint') throw Error('Expected an arrangement hint')
    expect(result.hint.reason).toContain('possible arrangement')
    expect(result.hint.reason.startsWith(lesson.reason)).toBe(true)
    const match = lesson.reason.match(/Possible tent (?:columns|rows): ([^.]+)\./)
    if (!match) throw Error('Missing arrangements')
    const patterns = match[1]!.split('; ').map(pattern => new Set(pattern.split(', ').map(Number)))
    const first = patterns[0]!
    const common = [...first].filter(position => patterns.every(pattern => pattern.has(position)))
    const answers = common.map(position => lesson.axis === 'row' ? lesson.line * lesson.board.size + position - 1 : (position - 1) * lesson.board.size + lesson.line)
      .filter(cell => lesson.state[cell] === 0 && !lesson.board.trees.includes(cell)).sort((a, b) => a - b)
    expect(lesson.answers.map(answer => answer.cell)).toEqual(answers)
    for (const answer of answers) {
      expect(solution).toContain(answer)
      expect(findTentsHint(lesson.board, editTent(lesson.board, lesson.state, answer, 2)).kind).toBe('contradiction')
    }
  }
})

it('verifies the tree and line premises of every advanced Tents exercise', () => {
  expect(advanced).toHaveLength(6)
  for (const source of advanced) {
    const lesson = GRID_LESSONS.find(item => item.id === source.id)!
    if (lesson.kind !== 'tents') throw Error('Expected Tents')
    const { board, state } = lesson
    const adjacent = (cell: number, diagonal = false) => tentsNeighbours(board, cell, diagonal)
    const possible = (cell: number) => state[cell] === 0 && !board.trees.includes(cell)
      && adjacent(cell).some(other => board.trees.includes(other))
      && !adjacent(cell, true).some(other => state[other] === 1)
    const solution = tentsReport.samples.find(sample => sample.id === lesson.source)!.solution
    expect(state.every((mark, cell) => mark === 0 || (mark === 1) === solution.includes(cell))).toBe(true)
    for (const [index, tree] of source.trees.entries()) {
      expect(adjacent(tree).some(cell => state[cell] === 1)).toBe(false)
      expect(adjacent(tree).filter(possible)).toEqual(source.options[index])
    }
    if (source.technique === 'line') {
      const line = tentsLines(board).find(item => item.name.toLowerCase() === `${lesson.axis} ${lesson.line + 1}`)!
      expect(line.count - line.cells.filter(cell => state[cell] === 1).length).toBe(source.trees.length)
      expect(source.options.flat().every(cell => line.cells.includes(cell))).toBe(true)
    }
    for (const { cell } of lesson.answers) {
      expect(possible(cell)).toBe(true)
      expect(solution).not.toContain(cell)
      if (source.technique === 'protect') {
        expect(adjacent(cell)).not.toContain(source.trees[0])
        expect(source.options[0]!.every(option => adjacent(cell, true).includes(option))).toBe(true)
      } else expect(source.options.flat()).not.toContain(cell)
    }
  }
})
