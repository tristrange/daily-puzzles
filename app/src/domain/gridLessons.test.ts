import { expect, it } from 'vitest'
import nuriPreviews from '../../../docs/measurements/nurikabe-preview.json'
import nuriDaily from '../../../docs/measurements/daily-nurikabe-launch.json'
import tentsReport from '../../../docs/measurements/tents-preview.json'
import advanced from '../data/tents-advanced-lessons.json'
import matching from '../data/tents-matching-lessons.json'
import tentsPreviews from '../data/tents-previews.json'
import advancedNurikabe from '../data/nurikabe-advanced-lessons.json'
import { GRID_LESSONS } from './gridLessons'
import { nurikabeNeighbours } from './nurikabe'
import { solveNurikabe } from './nurikabeSolve'
import { nextNurikabeDeduction } from './nurikabeHints'
import { editTent, tentsNeighbours, tentsLines } from './tents'
import { findTentsHint } from './tentsHints'

it('uses verified boards and teaches every sea-connection answer in the named row', () => {
  const lessons = GRID_LESSONS.filter(lesson => lesson.kind === 'nurikabe' && lesson.technique === 'sea')
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

it('verifies all possible island shapes and isolated-land deductions', () => {
  expect(advancedNurikabe).toHaveLength(6)
  for (const exercise of advancedNurikabe) {
    const lesson = GRID_LESSONS.find(item => item.id === exercise.id)!
    if (lesson.kind !== 'nurikabe') throw Error('Expected Nurikabe')
    const { board, state } = lesson, clue = exercise.clue, size = board.clues[clue]!
    const source = [...nuriPreviews.samples, ...nuriDaily.samples].find(sample => sample.id === lesson.source)!
    expect(board.clues).toEqual(source.clues)
    const solved = solveNurikabe(board)
    expect(solved.kind).toBe('unique')
    if (solved.kind !== 'unique') throw Error('Expected a unique board')
    expect(state.every((mark, cell) => mark === 0 || mark === solved.cells[cell])).toBe(true)
    const neighbours = (cell: number) => nurikabeNeighbours(board.size, cell)
    const otherClues = board.clues.flatMap((value, cell) => value && cell !== clue ? [cell] : [])
    const allowed = state.flatMap((mark, cell) => mark !== 1 && !otherClues.some(other => other === cell || neighbours(other).includes(cell)) ? [cell] : [])
    const options = allowed.filter(cell => cell !== clue && Math.abs(Math.floor(cell / board.size) - Math.floor(clue / board.size)) + Math.abs(cell % board.size - clue % board.size) < size)
    const shapes: number[][] = []
    const choose = (start: number, chosen: number[]) => {
      if (chosen.length === size - 1) {
        const shape = [clue, ...chosen], cells = new Set(shape), reached = new Set([clue]), queue = [clue]
        for (const cell of queue) for (const next of neighbours(cell)) if (cells.has(next) && !reached.has(next)) { reached.add(next); queue.push(next) }
        if (reached.size !== size || shape.some(cell => neighbours(cell).some(next => state[next] === 2 && !cells.has(next)))) return
        if (exercise.technique === 'connect-land' && !exercise.group.every(cell => cells.has(cell))) return
        shapes.push(shape.sort((a, b) => a - b))
        return
      }
      for (let i = start; i <= options.length - (size - 1 - chosen.length); i++) choose(i + 1, [...chosen, options[i]!])
    }
    choose(0, [])
    const normalize = (values: number[][]) => values.map(shape => shape.join(',')).sort()
    expect(normalize(shapes)).toEqual(normalize(exercise.shapes))
    expect(shapes.length).toBeGreaterThan(1)
    if (exercise.technique === 'connect-land') {
      expect(exercise.group).toHaveLength(1)
      const land = exercise.group[0]!
      expect(state[land]).toBe(2)
      for (const other of otherClues) {
        const distance = Math.abs(Math.floor(other / board.size) - Math.floor(land / board.size)) + Math.abs(other % board.size - land % board.size)
        expect(distance).toBeGreaterThanOrEqual(board.clues[other]!)
      }
    }
    const answers = state.flatMap((mark, cell) => mark === 0 && Math.floor(cell / board.size) === lesson.line && shapes.every(shape => shape.includes(cell)) ? [cell] : [])
    expect(lesson.answers.map(answer => answer.cell)).toEqual(answers)
    expect(answers.every(cell => solved.cells[cell] === 2)).toBe(true)
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

it('verifies competing-tree pairings, line limits and every accepted answer', () => {
  expect(matching).toHaveLength(6)
  for (const exercise of matching) {
    const lesson = GRID_LESSONS.find(item => item.id === exercise.id)!
    if (lesson.kind !== 'tents') throw Error('Expected Tents')
    const { board, state } = lesson
    expect(board).toEqual(tentsPreviews.find(item => item.id === board.id))
    const solution = tentsReport.samples.find(sample => sample.id === board.id)!.solution
    expect(state.every((mark, cell) => mark === 0 || (mark === 1) === solution.includes(cell))).toBe(true)
    const adjacent = (cell: number, diagonal = false) => tentsNeighbours(board, cell, diagonal)
    const options = exercise.trees.map(tree => {
      expect(board.trees).toContain(tree)
      expect(adjacent(tree).some(cell => state[cell] === 1)).toBe(false)
      return adjacent(tree).filter(cell => !board.trees.includes(cell) && state[cell] === 0 && !adjacent(cell, true).some(other => state[other] === 1))
    })
    expect(options).toEqual(exercise.options)
    expect(options.every(cells => cells.length >= 2)).toBe(true)
    const arrangements = (choices: number[][], limit: boolean) => {
      const result = new Set<string>()
      const visit = (index: number, tents: number[]) => {
        if (index === choices.length) {
          if (limit && exercise.countLine) {
            const [axis, line, clue, already] = exercise.countLine
            const count = tents.filter(cell => axis === 'row' ? Math.floor(cell / board.size) === line : cell % board.size === line).length
            if (count + Number(already) > Number(clue)) return
          }
          result.add([...tents].sort((a, b) => a - b).join(',')); return
        }
        for (const cell of choices[index]!) if (tents.every(other => other !== cell && !adjacent(other, true).includes(cell))) visit(index + 1, [...tents, cell])
      }
      visit(0, [])
      return [...result].sort().map(value => value.split(',').map(Number))
    }
    const baseline = arrangements(options, false), remaining = arrangements(options, true)
    const normalized = (patterns: number[][]) => patterns.map(pattern => pattern.join(',')).sort()
    expect(normalized(baseline)).toEqual(normalized(exercise.patterns))
    expect(normalized(remaining)).toEqual(normalized(exercise.kept))
    expect(remaining.length).toBeGreaterThan(1)
    if (exercise.countLine) {
      const [axis, index, clue, already] = exercise.countLine
      const marked = state.filter((mark, cell) => mark === 1 && (axis === 'row' ? Math.floor(cell / board.size) === index : cell % board.size === index)).length
      expect(marked).toBe(already)
      expect(axis === 'row' ? board.rowClues[Number(index)] : board.colClues[Number(index)]).toBe(clue)
      expect(remaining.length).toBeLessThan(baseline.length)
    }
    const decided = (cell: number, patterns: number[][]) => lesson.value === 1 ? patterns.every(pattern => pattern.includes(cell)) : patterns.every(pattern => !pattern.includes(cell))
    const pool = [...new Set(options.flat())].sort((a, b) => a - b)
    const answers = pool.filter(cell => Math.floor(cell / board.size) === lesson.line && decided(cell, remaining)
      && (exercise.technique === 'matching' || !decided(cell, baseline)))
    expect(lesson.answers.map(answer => answer.cell)).toEqual(answers)
    for (const answer of answers) {
      expect(solution.includes(answer)).toBe(lesson.value === 1)
      // No two of the three trees should prove the advertised target by themselves.
      for (let omitted = 0; omitted < 3; omitted++) {
        const pair = options.filter((_, index) => index !== omitted)
        if (!pair.flat().includes(answer)) continue
        const pairPatterns = arrangements(pair, true)
        expect(pairPatterns.length).toBeGreaterThan(0)
        // Alternative accepted cells can be independently decidable; the primary example cannot.
        if (answer === lesson.answers[0]!.cell) expect(decided(answer, pairPatterns)).toBe(false)
      }
    }
  }
})
