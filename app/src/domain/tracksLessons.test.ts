import { expect, it } from 'vitest'
import rawLessons from '../data/tracks-lessons.json'
import solutions from './tracksLessonSolutions.json'
import { GRID_LESSONS } from './gridLessons'
import { EAST, NORTH, PIECE_ENDS, SOUTH, WEST } from './tracks'
import { CROSS, MAYBE, isTracksSolved } from './tracksGame'

it('checks the prepared route, count, loop and combined deductions', () => {
  expect(rawLessons).toHaveLength(12)
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
    if (raw.technique === 'edges') {
      const column = (index: number) => Array.from({ length: board.height }, (_, row) => board.index(row, index))
      if (raw.id === 'tracks-edges-1') {
        const corner = 7, answer = 15
        expect(column(7)).toHaveLength(8)
        expect(board.colClues[7]).toBe(7)
        expect(board.neighbour(corner, NORTH)).toBeNull()
        expect(board.neighbour(corner, EAST)).toBeNull()
        expect(PIECE_ENDS.slice(1).filter(ends => !ends.includes(NORTH) && !ends.includes(EAST))).toEqual([[SOUTH, WEST]])
        expect(board.neighbour(corner, SOUTH)).toBe(answer)
        expect(lesson.answers).toEqual([{ cell: answer, brush: MAYBE, support: [7, 23, 31, 39, 47, 55, 63] }])
      } else if (raw.id === 'tracks-edges-2') {
        const cells = column(7), clue = board.colClues[7]!
        const givenTracks = cells.filter(cell => state.pieces[cell] !== 0)
        const open = cells.filter(cell => state.pieces[cell] === 0)
        expect(cells.map(cell => state.pieces[cell])).toEqual([0, 0, 0, 0, 6, 0, 0, 0])
        expect(givenTracks).toEqual([39])
        expect(clue).toBe(7)
        expect(open.length).toBeGreaterThan(clue - givenTracks.length)
        const lineEnds = board.givens.flatMap((piece, cell) => PIECE_ENDS[piece]!.filter(direction => board.neighbour(cell, direction) === null))
        expect(lineEnds).toHaveLength(2)
        expect(PIECE_ENDS[state.pieces[39]!]).toEqual([WEST, NORTH])
        expect(lesson.prompt).toContain('column 8')
        expect(lesson.prompt).toContain('Which cell does this force to contain track?')
        expect(lesson.prompt).not.toContain('row 7')
        const rowSeven = Array.from({ length: board.width }, (_, col) => board.index(6, col))
        const givenLeft = rowSeven[3]!
        expect(state.pieces[givenLeft]).toBe(3)
        expect(PIECE_ENDS[3]).toContain(EAST)
        expect(board.neighbour(givenLeft, EAST)).toBe(rowSeven[4])
        expect(lesson.answers.map(answer => answer.cell)).not.toContain(rowSeven[4])
        const below = 47
        expect(board.neighbour(below, NORTH)).toBe(39)
        expect(board.neighbour(below, EAST)).toBeNull()
        expect(PIECE_ENDS.slice(1).filter(ends => !ends.includes(NORTH) && !ends.includes(EAST))).toEqual([[SOUTH, WEST]])
        expect(board.neighbour(below, SOUTH)).toBe(55)
        expect(lesson.answers).toEqual([{ cell: 55, brush: MAYBE, support: [4, 8, 39, 47] }])
      } else if (raw.id === 'tracks-edges-3') {
        const cells = column(0), clue = board.colClues[0]!
        const known = cells.filter(cell => state.pieces[cell] !== 0 && state.pieces[cell] !== CROSS)
        const candidates = cells.filter(cell => Math.floor(cell / board.width) >= 3 && state.pieces[cell] === 0)
        expect(cells.map(cell => state.pieces[cell])).toEqual([5, MAYBE, 0, 0, 0, 0, 0, 0])
        expect(known).toEqual([0, 8])
        expect(clue).toBe(3)
        expect(clue - known.length).toBe(1)
        expect(candidates).toEqual([24, 32, 40, 48, 56])
        expect(board.givens.flatMap((piece, cell) => PIECE_ENDS[piece]!.filter(direction => board.neighbour(cell, direction) === null))).toHaveLength(2)
        expect(lesson.answers).toEqual(candidates.map(cell => ({ cell, brush: CROSS, support: [0, 8, 16] })))
        for (const cell of candidates) {
          expect(board.neighbour(cell, WEST)).toBeNull()
          expect(board.neighbour(cell, EAST)).not.toBeNull()
          for (const direction of [NORTH, SOUTH]) {
            const other = board.neighbour(cell, direction)
            if (other !== null) expect(state.pieces[other]).toBe(0)
          }
        }
        expect(PIECE_ENDS.slice(1).every(ends => ends.length === 2)).toBe(true)
      } else {
        throw Error(`Unexpected combined deduction: ${raw.id}`)
      }
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
