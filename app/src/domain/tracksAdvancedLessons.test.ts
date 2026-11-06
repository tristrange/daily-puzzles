import { expect, it } from 'vitest'
import advanced from '../data/tracks-advanced-lessons.json'
import oct06 from '../../public/puzzles/2026-10-06-tracks-medium.json'
import oct08 from '../../public/puzzles/2026-10-08-tracks-small.json'
import oct12 from '../../public/puzzles/2026-10-12-tracks-medium.json'
import oct19 from '../../public/puzzles/2026-10-19-tracks-small.json'
import nov05 from '../../public/puzzles/2026-11-05-tracks-small.json'
import solutions from './tracksLessonSolutions.json'
import { GRID_LESSONS, GRID_TECHNIQUES, type GridLesson } from './gridLessons'
import { trackHintLesson } from './hintLessons'
import { EAST, NORTH, PIECE_ENDS, SOUTH, WEST } from './tracks'
import { CROSS, MAYBE, isTracksSolved } from './tracksGame'
import { findTrackHint } from './trackHints'

const sources = [oct06, oct08, oct12, oct19, nov05]
type TracksLesson = Extract<GridLesson, { kind: 'train-tracks' }>

// Enumerate shapes directly from the visible marks; this is independent of the
// hint engine's dynamic-programming line solver.
function arrangements(lesson: TracksLesson, axis: string, index: number, connect: boolean): string[] {
  const { board, state } = lesson
  const horizontal = axis === 'row', direction = horizontal ? EAST : SOUTH
  const cells = Array.from({ length: horizontal ? board.width : board.height }, (_, i) =>
    horizontal ? board.index(index, i) : board.index(i, index))
  const clue = horizontal ? board.rowClues[index]! : board.colClues[index]!
  const domain = cells.map(cell => {
    const mark = state.pieces[cell]!
    const pieces = mark === CROSS ? [0] : mark === MAYBE ? [1, 2, 3, 4, 5, 6] : mark === 0 ? [0, 1, 2, 3, 4, 5, 6] : [mark]
    return pieces.filter(piece => [0, 1, 2, 3].every(side => {
      const neighbour = board.neighbour(cell, side), hasEnd = PIECE_ENDS[piece]!.includes(side)
      if (neighbour === null) return !hasEnd || board.givens[cell] !== 0
      if (cells.includes(neighbour)) return true
      const other = state.pieces[neighbour]!
      if (other === CROSS) return !hasEnd
      if (other >= 1 && other <= 6) return hasEnd === PIECE_ENDS[other]!.includes((side + 2) % 4)
      return true
    }))
  })
  const patterns = new Set<string>()
  const visit = (position: number, used: number, pieces: number[]) => {
    if (used > clue || used + cells.length - position < clue) return
    if (position === cells.length) {
      if (used === clue) patterns.add(pieces.map(piece => Number(piece !== 0)).join(''))
      return
    }
    for (const piece of domain[position]!) {
      if (connect && position > 0
        && PIECE_ENDS[pieces[position - 1]!]!.includes(direction) !== PIECE_ENDS[piece]!.includes((direction + 2) % 4)) continue
      visit(position + 1, used + Number(piece !== 0), [...pieces, piece])
    }
  }
  visit(0, 0, [])
  return [...patterns].sort()
}

it('keeps the new exercises ordered and grounded in published boards', () => {
  expect(GRID_TECHNIQUES['train-tracks'].slice(-2).map(item => item.id)).toEqual(['line-pattern', 'contradiction'])
  for (const technique of ['line-pattern', 'contradiction']) {
    const lessons = GRID_LESSONS.filter(lesson => lesson.kind === 'train-tracks' && lesson.technique === technique)
    expect(lessons.map(lesson => [lesson.exerciseNumber, lesson.guidance])).toEqual([[1, 'guided'], [2, 'practice'], [3, 'practice']])
  }
  for (const raw of advanced) {
    const lesson = GRID_LESSONS.find(item => item.id === raw.id)!
    if (lesson.kind !== 'train-tracks') throw Error('Expected Train Tracks')
    const source = sources.find(puzzle => puzzle.id === raw.source)
    const solution = Object.entries(solutions).find(([id]) => id === raw.source)?.[1]
    if (!source || !solution) throw Error(`Missing source or solution: ${raw.source}`)
    expect(raw.board).toEqual(source.board)
    expect(isTracksSolved({ grid: lesson.board, pieces: solution })).toBe(true)
    for (const [cell, mark] of lesson.state.pieces.entries()) {
      expect(mark === 0 || (mark === CROSS ? solution[cell] === 0 : mark === MAYBE ? solution[cell] !== 0 : mark === solution[cell])).toBe(true)
    }
    for (const answer of lesson.answers) {
      expect(lesson.state.pieces[answer.cell]).toBe(0)
      expect(answer.support.every(cell => cell >= 0 && cell < lesson.board.cellCount && cell !== answer.cell)).toBe(true)
      expect(answer.brush === CROSS ? solution[answer.cell] === 0 : answer.brush === MAYBE ? solution[answer.cell] !== 0 : answer.brush === solution[answer.cell]).toBe(true)
    }
  }
})

it('independently checks every line arrangement and the offered answers', () => {
  for (const raw of advanced) {
    if (!('linePattern' in raw) || !raw.linePattern) continue
    const lesson = GRID_LESSONS.find(item => item.id === raw.id)!
    if (lesson.kind !== 'train-tracks') throw Error('Expected Train Tracks')
    const { axis, index, arrangements: expected } = raw.linePattern
    const withConnections = arrangements(lesson, axis, index, true)
    const countsOnly = arrangements(lesson, axis, index, false)
    expect(withConnections).toEqual([...expected].sort())
    expect(withConnections.length).toBeGreaterThan(1)
    for (const answer of lesson.answers) {
      const position = axis === 'row' ? answer.cell % lesson.board.width : Math.floor(answer.cell / lesson.board.width)
      const result = answer.brush === CROSS ? '0' : '1'
      expect(withConnections.every(pattern => pattern[position] === result)).toBe(true)
      expect(countsOnly.some(pattern => pattern[position] !== result)).toBe(true)
    }
  }
})

it.each(advanced)('matches a real explained hint to its lesson: $id', raw => {
  const lesson = GRID_LESSONS.find(item => item.id === raw.id)!
  if (lesson.kind !== 'train-tracks') throw Error('Expected Train Tracks')
  const result = findTrackHint(lesson.state)
  expect(result.kind).toBe('hint')
  if (result.kind !== 'hint') throw Error('Expected a hint')
  expect(result.hint.steps.at(-1)?.rule).toBe(raw.technique)
  expect(lesson.answers.some(answer => answer.cell === result.hint.cell && answer.brush === result.hint.brush)).toBe(true)
  expect(trackHintLesson(result.hint)?.path).toBe(`/learn/train-tracks/tracks-${raw.technique}-1`)
})

// Check two contradiction examples against just their local neighbourhoods.
// Unknown outside cells are left unconstrained, so zero arrangements is a
// contradiction even without relying on the complete puzzle's solution.
function localPossibilities(lesson: TracksLesson, cells: number[], assumedCell: number, assumption: number, row?: number): number {
  const { board, state } = lesson, placed = new Map<number, number>()
  let count = 0
  const known = (cell: number) => placed.get(cell) ?? (cells.includes(cell) ? undefined : state.pieces[cell])
  const visit = (at: number) => {
    if (at === cells.length) {
      if (row !== undefined) {
        const marks = Array.from({ length: board.width }, (_, col) => known(board.index(row, col)))
        const occupied = marks.filter(mark => mark !== undefined && mark !== 0 && mark !== CROSS).length
        const unknown = marks.filter(mark => mark === undefined || mark === 0).length
        if (occupied > board.rowClues[row]! || occupied + unknown < board.rowClues[row]!) return
      }
      count++
      return
    }
    const cell = cells[at]!, original = cell === assumedCell ? assumption : state.pieces[cell]!
    const options = original === CROSS ? [0] : original === MAYBE ? [1, 2, 3, 4, 5, 6] : original === 0 ? [0, 1, 2, 3, 4, 5, 6] : [original]
    for (const piece of options) {
      const fits = [0, 1, 2, 3].every(side => {
        const neighbour = board.neighbour(cell, side), end = PIECE_ENDS[piece]!.includes(side)
        if (neighbour === null) return !end || board.givens[cell] !== 0
        const other = known(neighbour)
        if (other === undefined || other === MAYBE || (other === 0 && !placed.has(neighbour))) return true
        return end === PIECE_ENDS[other === CROSS ? 0 : other]!.includes((side + 2) % 4)
      })
      if (!fits) continue
      placed.set(cell, piece); visit(at + 1); placed.delete(cell)
    }
  }
  visit(0)
  return count
}

it.each([
  { id: 'tracks-contradiction-1', cells: [32, 33, 40, 41], target: 41, wrong: CROSS, right: MAYBE },
  { id: 'tracks-contradiction-2', cells: [3, 4, 9, 11, 12], target: 9, wrong: MAYBE, right: CROSS, row: 1 },
])('independently checks the local contradiction in $id', ({ id, cells, target, wrong, right, row }) => {
  const lesson = GRID_LESSONS.find(item => item.id === id)!
  if (lesson.kind !== 'train-tracks') throw Error('Expected Train Tracks')
  expect(localPossibilities(lesson, cells, target, wrong, row)).toBe(0)
  expect(localPossibilities(lesson, cells, target, right, row)).toBeGreaterThan(0)
})

it('checks the loop and row-count chain in the final contradiction exercise', () => {
  const lesson = GRID_LESSONS.find(item => item.id === 'tracks-contradiction-3')!
  if (lesson.kind !== 'train-tracks') throw Error('Expected Train Tracks')
  const { board, state } = lesson, piece = (row: number, col: number) => state.pieces[board.index(row - 1, col - 1)]!
  // Assuming r1c2 contains track fills row 1 and leaves r1c4 empty.
  expect(board.rowClues[0]).toBe(6)
  expect([3, 5, 6, 7, 8].every(col => piece(1, col) > 0 && piece(1, col) !== CROSS)).toBe(true)
  expect([piece(1, 1), piece(1, 2), piece(1, 4)]).toEqual([CROSS, 0, 0])
  // The top edge and empty neighbours force r1c2 east/south and r1c3 west/south.
  const shapesWith = (required: number[], blocked: number[]) => PIECE_ENDS.flatMap((shape, index) =>
    index > 0 && required.every(end => shape.includes(end)) && blocked.every(end => !shape.includes(end)) ? [index] : [])
  expect(shapesWith([], [NORTH, WEST])).toEqual([4]) // r1c2
  expect(shapesWith([WEST], [NORTH, EAST])).toEqual([5]) // r1c3
  expect(PIECE_ENDS[piece(1, 6)]).toContain(WEST)
  expect(shapesWith([EAST], [NORTH, WEST])).toEqual([4]) // r1c5
  // Those connections fill row 2, so r2c4 is empty. Joining r2c2 and r2c3
  // would close a loop through the two forced top-edge pieces.
  expect(board.rowClues[1]).toBe(7)
  expect([piece(2, 1), piece(2, 3), piece(2, 6), piece(2, 7), piece(2, 8)]).toEqual([5, MAYBE, MAYBE, 6, 2])
  expect([piece(2, 2), piece(2, 4), piece(2, 5)]).toEqual([0, 0, 0])
  expect(PIECE_ENDS[piece(2, 1)]).not.toContain(EAST)
  // Both r2c2 and r2c3 must go south, adding two tracks to three already in row 3.
  expect(shapesWith([NORTH], [EAST, WEST])).toEqual([2])
  expect([piece(3, 1), piece(3, 7), piece(3, 8)]).toEqual([MAYBE, MAYBE, 6])
  expect([piece(3, 2), piece(3, 3)]).toEqual([0, 0])
  expect(board.rowClues[2]).toBe(4)
  expect(3 + 2).toBeGreaterThan(board.rowClues[2]!)
})
