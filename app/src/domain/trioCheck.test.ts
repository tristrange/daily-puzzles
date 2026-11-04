import { expect, it } from 'vitest'
import proof from '@shared/docs/measurements/trio-pilot.json'
import previews from '../data/trio-previews.json'
import { createTrioGame, isTrioValue, parseTrioBoard, type TrioBoard, type TrioValue } from './trio'
import { checkTrioEntries, solveTrio } from './trioCheck'

it.each(previews.map((raw, index) => ({ raw, expected: proof.samples[index]!.solution })))
('independently verifies the preview solution', ({ raw, expected }) => {
  expect(solveTrio(parseTrioBoard(raw))).toEqual({ kind: 'unique', cells: expected })
})

it('never treats an incomplete search, impossible puzzle, or multiple solutions as unique', () => {
  const base = parseTrioBoard(previews[0])
  const empty: TrioBoard = { ...base, givens: Array<TrioValue>(81).fill(0), relations: [] }
  const impossible: TrioBoard = { ...empty, givens: empty.givens.map((_, i): TrioValue => i < 4 ? 1 : 0) }
  expect(solveTrio(base, 0)).toEqual({ kind: 'limit' })
  expect(solveTrio(impossible)).toEqual({ kind: 'none' })
  expect(solveTrio(empty)).toEqual({ kind: 'multiple' })
})

it('checks placed symbols without treating notes as assertions', () => {
  const board = parseTrioBoard(previews[0]), game = createTrioGame(board)
  const cell = board.givens.indexOf(0), answer = proof.samples[0]!.solution[cell]!
  if (!isTrioValue(answer) || answer === 0) throw Error('Invalid solution fixture')
  const right = game.cells.map((value, i): TrioValue => i === cell ? answer : value)
  const wrong = game.cells.map((value, i): TrioValue => i === cell ? answer === 1 ? 2 : 1 : value)
  expect(checkTrioEntries(board, { cells: right, notes: game.notes.map(() => 7) })).toEqual({ kind: 'correct' })
  expect(checkTrioEntries(board, { cells: wrong, notes: game.notes })).toEqual({ kind: 'mistake', cell })
})
