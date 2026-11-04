import { expect, it } from 'vitest'
import proof from '@shared/docs/measurements/tents-preview.json'
import previews from '../data/tents-previews.json'
import { createTentsGame, parseTentsBoard, type TentsBoard, type TentsMark } from './tents'
import { checkTentsEntries, solveTents } from './tentsCheck'

it.each(previews.map((raw, index) => ({ raw, expected: proof.samples[index]!.solution })))
('independently verifies the preview solution', ({ raw, expected }) => {
  expect(solveTents(parseTentsBoard(raw))).toEqual({ kind: 'unique', tents: new Set(expected) })
})

it('never treats an incomplete search, impossible puzzle, or multiple placements as unique', () => {
  const base = parseTentsBoard(previews[0])
  const ambiguous: TentsBoard = { id: 'ambiguous', size: 8, trees: [1, 17],
    rowClues: [1, 0, 1, 0, 0, 0, 0, 0], colClues: [1, 0, 1, 0, 0, 0, 0, 0] }
  const impossible: TentsBoard = { ...ambiguous, trees: [1], rowClues: [1, 0, 0, 0, 0, 0, 0, 0], colClues: [0, 0, 0, 0, 0, 0, 0, 1] }
  expect(solveTents(base, 0)).toEqual({ kind: 'limit' })
  expect(solveTents(impossible)).toEqual({ kind: 'none' })
  expect(solveTents(ambiguous)).toEqual({ kind: 'multiple' })
})

it('counts a placement once even when the tents can be paired with trees in different ways', () => {
  const board: TentsBoard = { id: 'pairings', size: 8, trees: [1, 8, 10, 17],
    rowClues: [2, 0, 2, 0, 0, 0, 0, 0], colClues: [2, 0, 2, 0, 0, 0, 0, 0] }
  expect(solveTents(board)).toEqual({ kind: 'unique', tents: new Set([0, 2, 16, 18]) })
})

it('checks tents and grass against the placement, not the pairing chosen by the solver', () => {
  const board = parseTentsBoard(previews[0]), game = createTentsGame(board)
  const answer = new Set(proof.samples[0]!.solution), tent = [...answer][0]!
  const grass = game.findIndex((_, cell) => !answer.has(cell) && !board.trees.includes(cell))
  const mark = (cell: number, value: TentsMark) => game.map((original, i): TentsMark => i === cell ? value : original)
  expect(checkTentsEntries(board, mark(tent, 1))).toEqual({ kind: 'correct' })
  expect(checkTentsEntries(board, mark(grass, 2))).toEqual({ kind: 'correct' })
  expect(checkTentsEntries(board, mark(tent, 2))).toEqual({ kind: 'mistake', cell: tent })
  expect(checkTentsEntries(board, mark(grass, 1))).toEqual({ kind: 'mistake', cell: grass })
})
