import { expect, it } from 'vitest'
import { TrackGrid } from './tracks'
import { createTracksGame, CROSS, isTracksSolved, MAYBE } from './tracksGame'
import { checkTracksEntries, solveTracks } from './tracksCheck'
import largePuzzle from '../../public/puzzles/2026-11-04-tracks-large.json'

const straight = new TrackGrid(3, 3, [0, 3, 0], [1, 1, 1], [0, 0, 0, 1, 0, 1, 0, 0, 0])
const ambiguous = new TrackGrid(4, 4, [3, 3, 4, 2], [1, 3, 4, 4], [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 4, 0])
const impossible = new TrackGrid(3, 3, [2, 1, 2], [3, 1, 1], [1, 0, 0, 0, 0, 0, 0, 0, 1])

it('verifies the only route for a simple board', () => {
  expect(solveTracks(straight)).toEqual({ kind: 'unique', pieces: [0, 0, 0, 1, 1, 1, 0, 0, 0] })
})

it('verifies a published large board', () => {
  const { width, height, rowClues, colClues, givens } = largePuzzle.board
  const grid = new TrackGrid(width, height, rowClues, colClues, givens)
  const result = solveTracks(grid)
  expect(result.kind).toBe('unique')
  if (result.kind === 'unique') expect(isTracksSolved({ grid, pieces: result.pieces })).toBe(true)
})

it('never treats an incomplete search, impossible puzzle, or multiple routes as unique', () => {
  expect(solveTracks(straight, 0)).toEqual({ kind: 'limit' })
  expect(solveTracks(impossible)).toEqual({ kind: 'none' })
  expect(solveTracks(ambiguous)).toEqual({ kind: 'multiple' })
})

it('agrees with exhaustive enumeration on small boards', () => {
  const grids = [
    new TrackGrid(2, 2, [2, 0], [1, 1], [1, 1, 0, 0]),
    new TrackGrid(2, 2, [1, 2], [2, 1], [2, 0, 0, 1]),
    new TrackGrid(2, 2, [1, 1], [1, 1], [2, 0, 0, 1]),
  ]
  for (const grid of grids) {
    const answers: number[][] = []
    for (let encoded = 0; encoded < 7 ** grid.cellCount; encoded++) {
      let remaining = encoded
      const pieces = Array.from({ length: grid.cellCount }, () => { const piece = remaining % 7; remaining = Math.floor(remaining / 7); return piece })
      if (isTracksSolved({ grid, pieces })) answers.push(pieces)
    }
    const result = solveTracks(grid)
    expect(result.kind).toBe(answers.length === 0 ? 'none' : answers.length === 1 ? 'unique' : 'multiple')
    if (result.kind === 'unique') expect(result.pieces).toEqual(answers[0])
  }
})

it('checks tracks, crosses and undecided track marks according to their meaning', () => {
  const game = createTracksGame(straight)
  const mark = (cell: number, value: number) => ({ ...game, pieces: game.pieces.map((piece, i) => i === cell ? value : piece) })
  expect(checkTracksEntries(mark(0, CROSS))).toEqual({ kind: 'correct' })
  expect(checkTracksEntries(mark(4, 1))).toEqual({ kind: 'correct' })
  expect(checkTracksEntries(mark(4, MAYBE))).toEqual({ kind: 'correct' })
  expect(checkTracksEntries(mark(4, 2))).toEqual({ kind: 'mistake', cell: 4 })
  expect(checkTracksEntries(mark(4, CROSS))).toEqual({ kind: 'mistake', cell: 4 })
  expect(checkTracksEntries(mark(0, MAYBE))).toEqual({ kind: 'mistake', cell: 0 })
})
