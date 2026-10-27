import { expect, it } from 'vitest'
import rawLessons from '../data/tracks-lessons.json'
import solutions from './tracksLessonSolutions.json'
import { GRID_LESSONS } from './gridLessons'
import { PIECE_ENDS } from './tracks'
import { CROSS, MAYBE, isTracksSolved } from './tracksGame'

it('checks the prepared route, count and loop deductions', () => {
  expect(rawLessons).toHaveLength(9)
  for (const raw of rawLessons) {
    const lesson = GRID_LESSONS.find(item => item.id === raw.id)!
    if (lesson.kind !== 'train-tracks') throw Error('Expected Train Tracks')
    const { board, state } = lesson
    const solution = Object.entries(solutions).find(([id]) => id === raw.source)?.[1]
    if (!solution) throw Error('Missing verified solution')
    expect(isTracksSolved({ grid: board, pieces: solution })).toBe(true)
    expect(state.pieces.every((piece, cell) => piece === 0 || (piece === CROSS ? solution[cell] === 0 : piece === MAYBE ? solution[cell] !== 0 : piece === solution[cell]))).toBe(true)
    const canFace = (cell: number, dir: number) => {
      const piece = state.pieces[cell]!
      return piece === 0 || piece === MAYBE || (piece !== CROSS && PIECE_ENDS[piece]!.includes(dir))
    }
    const reachable = (start: number, goal: number, cut: number | null, blocked: Set<number>) => {
      const seen = new Set([start]), queue = [start]
      for (const cell of queue) for (let dir = 0; dir < 4; dir++) {
        const other = board.neighbour(cell, dir)
        if (other !== null && other !== cut && !blocked.has(other) && !seen.has(other) && canFace(cell, dir) && canFace(other, (dir + 2) % 4)) { seen.add(other); queue.push(other) }
      }
      return seen.has(goal)
    }
    const excluded = new Set(state.pieces.flatMap((piece, cell) => piece === CROSS ? [cell] : []))
    if (raw.technique === 'loop') {
      const path = raw.segment!, [first, ...tail] = path, last = path.at(-1)!
      expect(path.length).toBeGreaterThan(4)
      expect(state.pieces[first!]).toBe(MAYBE); expect(state.pieces[last]).toBe(MAYBE)
      for (let index = 1; index < path.length - 1; index++) {
        const cell = path[index]!, piece = state.pieces[cell]!
        const adjacent = PIECE_ENDS[piece]!.map(dir => board.neighbour(cell, dir))
        expect(adjacent).toContain(path[index - 1]); expect(adjacent).toContain(path[index + 1])
      }
      const answer = lesson.answers[0]!, available = Array.from({ length: 4 }, (_, dir) => dir).filter(dir => {
        const other = board.neighbour(first!, dir)
        return other !== null && !excluded.has(other) && canFace(other, (dir + 2) % 4)
      })
      expect(available.map(dir => board.neighbour(first!, dir)).sort()).toEqual([last, tail[0], raw.outside].sort())
      expect(PIECE_ENDS[answer.brush]!.map(dir => board.neighbour(first!, dir)).sort()).toEqual([tail[0], raw.outside].sort())
      expect(answer.cell).toBe(first); expect(solution[first!]).toBe(answer.brush)
      continue
    }
    const [start, end] = raw.anchors!
    let blocked = excluded
    if (raw.technique === 'counts') {
      const line = raw.line!, cells = Array.from({ length: board.width }, (_, i) => line.axis === 'row' ? board.index(line.index, i) : board.index(i, line.index))
      const clue = line.axis === 'row' ? board.rowClues[line.index] : board.colClues[line.index]
      expect(cells.filter(cell => state.pieces[cell] !== 0 && state.pieces[cell] !== CROSS)).toHaveLength(clue!)
      blocked = new Set([...excluded, ...cells.filter(cell => state.pieces[cell] === 0)])
      expect(reachable(start!, end!, lesson.answers[0]!.cell, excluded)).toBe(true)
    }
    expect(reachable(start!, end!, null, blocked)).toBe(true)
    const row = Math.floor(lesson.answers[0]!.cell / board.width)
    const all = state.pieces.flatMap((piece, cell) => piece === 0 && Math.floor(cell / board.width) === row && !reachable(start!, end!, cell, blocked) ? [cell] : [])
    expect(lesson.answers.map(answer => answer.cell)).toEqual(all)
    for (const answer of lesson.answers) { expect(answer.brush).toBe(MAYBE); expect(solution[answer.cell]).not.toBe(0) }
  }
})
