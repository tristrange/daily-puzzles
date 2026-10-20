import { expect, it } from 'vitest'
import queen from '@shared/conformance/hint-cases/2026-05-11.puzzle.json'
import star from '@shared/conformance/hint-cases/2026-09-26-star.puzzle.json'
import { Board } from './board'
import { conflicts, createGame } from './game'
import { marksBoard } from './helpers'
import { firstHint } from './hints'
import { parsePuzzle } from './puzzle'
import { checkedHint, solveMarks } from './checkedHints'

const queenBoard = marksBoard(parsePuzzle(queen))
const starBoard = marksBoard(parsePuzzle(star))
const starSolution = [1, 3, 13, 15, 17, 19, 29, 31, 32, 34, 44, 46, 48, 50, 60, 62]

it('finds the unique placement for both marks games without using player notes', () => {
  expect(solveMarks(queenBoard)).toEqual({ kind: 'unique', cells: new Set([3, 5, 12, 19, 21]) })
  expect(solveMarks(starBoard)).toEqual({ kind: 'unique', cells: new Set(starSolution) })
})

it('corrects a locally legal wrong star before a crossed-out solution cell', () => {
  const game = { ...createGame(starBoard), queens: new Set([0]), marks: new Set([1]) }
  expect(conflicts(game)).toEqual([])
  expect(firstHint(starBoard, game.queens, game.marks)).not.toBeNull()
  expect(checkedHint(game)).toMatchObject({ kind: 'hint', hint: { cell: 0, action: 'clear', rule: 'wrong-piece' } })
  expect(checkedHint({ ...game, queens: new Set() })).toMatchObject({ kind: 'hint', hint: { cell: 1, action: 'clear', rule: 'wrong-cross' } })
  expect(game.queens).toEqual(new Set([0]))
  expect(game.marks).toEqual(new Set([1]))
  const touching = { ...game, queens: new Set([1, 0]) }
  expect(conflicts(touching).length).toBeGreaterThan(0)
  expect(checkedHint(touching)).toMatchObject({ kind: 'hint', hint: { cell: 0, action: 'clear' } })
})

it('preserves explained deductions once placements and crosses are verified', () => {
  const game = { ...createGame(queenBoard), queens: new Set([3]), marks: new Set([0]) }
  expect(checkedHint(game)).toEqual({ kind: 'hint', hint: firstHint(queenBoard, game.queens, game.marks) })
})

it('never accuses a cell on ambiguous, impossible or unfinished searches', () => {
  const stripes = (size: number) => new Board(size, Array.from({ length: size * size }, (_, i) => Math.floor(i / size)), Array(size).fill(1), 'queens')
  expect(solveMarks(stripes(4))).toEqual({ kind: 'multiple' })
  expect(solveMarks(stripes(2))).toEqual({ kind: 'none' })
  expect(solveMarks(queenBoard, 0)).toEqual({ kind: 'limit' })
  expect(solveMarks(queenBoard, 8)).toEqual({ kind: 'limit' })
  expect(checkedHint({ ...createGame(stripes(4)), queens: new Set([0]) })).toEqual({ kind: 'unverified' })
  expect(checkedHint(createGame(stripes(2)))).toEqual({ kind: 'unverified' })
  expect(() => solveMarks(queenBoard, -1)).toThrow()
})
