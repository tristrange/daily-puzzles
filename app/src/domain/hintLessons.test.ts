import { expect, it } from 'vitest'
import raw from '../data/sudoku-previews.json'
import killerRaw from '../data/killer-sudoku-previews.json'
import playtest from './fixtures/sudoku-hard-playtest.json'
import { GRID_LESSONS } from './gridLessons'
import { nextNurikabeDeduction } from './nurikabeHints'
import { firstHint } from './hints'
import queensPuzzle from '../../../conformance/hint-cases/2026-05-17.puzzle.json'
import queensDaily from '../../public/puzzles/2026-10-05.json'
import { marksBoard } from './helpers'
import { parsePuzzle } from './puzzle'
import { createSudokuGame, parseSudokuBoards } from './sudoku'
import { findSudokuHint } from './sudokuHints'
import { parseKillerPreviews } from './killerSudoku'
import { applyKillerSudokuHint, findKillerSudokuHint } from './killerSudokuHints'
import { STAR_BATTLE_LESSONS } from './starBattleLessons'
import { TRIO_LESSONS } from './trioLessons'
import { marksHintLesson, nurikabeHintLesson, sudokuHintLesson, trioHintLesson } from './hintLessons'

it('offers the relevant guided lesson for real Sudoku, Nurikabe, Star Battle and Trio deductions', () => {
  const board = parseSudokuBoards(raw)[2]!
  const game = { cells: playtest.cells.flat(), notes: playtest.notes.flat().map(text =>
    [...text].reduce((mask, digit) => mask | (1 << (Number(digit) - 1)), 0)) }
  const sudoku = findSudokuHint(board, game)
  expect(sudoku.kind).toBe('hint')
  if (sudoku.kind !== 'hint') throw Error('Expected a Sudoku hint')
  expect(sudokuHintLesson(sudoku.hint, false)?.path).toBe('/learn/sudoku/locked-candidates')
  expect(sudokuHintLesson({ ...sudoku.hint, correction: true }, false)).toBeUndefined()
  expect(sudokuHintLesson({ ...sudoku.hint, rule: 'peer' }, false)).toBeUndefined()

  const sea = GRID_LESSONS.find(lesson => lesson.id === 'nurikabe-sea-connection-1')!
  if (sea.kind !== 'nurikabe') throw Error('Expected a Nurikabe lesson')
  const nuriHint = nextNurikabeDeduction(sea.board, sea.state)
  if (!nuriHint) throw Error('Expected a Nurikabe hint')
  expect(nurikabeHintLesson(nuriHint)?.path).toBe('/learn/nurikabe/nurikabe-sea-connection-1')

  const star = STAR_BATTLE_LESSONS.find(lesson => lesson.id === 'star-battle-subset')!
  expect(marksHintLesson('star-battle', star.hint)?.path).toBe('/learn/star-battle/star-battle-subset')
  const queens = firstHint(marksBoard(parsePuzzle(queensDaily)), new Set([1]), new Set([21, 25, 26, 27, 14, 42, 33, 34, 41]))
  expect(queens && marksHintLesson('queens', queens)?.path).toBe('/learn/queens/queens-pair-1')
  const threeRegions = firstHint(marksBoard(parsePuzzle(queensPuzzle)), new Set(), new Set([0, 11, 16, 17, 21, 22]))
  expect(threeRegions?.rule).toBe('subset')
  expect(threeRegions && marksHintLesson('queens', threeRegions)).toBeUndefined()
  const trio = TRIO_LESSONS.find(lesson => lesson.id === 'trio-relation-propagation')!
  expect(trioHintLesson(trio.examples[0]!.hint)?.path).toBe('/learn/trio/trio-relation-propagation')
})

it('offers cage practice only for a multi-cell cage deduction', () => {
  const board = parseKillerPreviews(killerRaw)[0]!
  let game = createSudokuGame(board)
  for (let step = 0; step < 100; step++) {
    const result = findKillerSudokuHint(board, game)
    if (result.kind !== 'hint') break
    if (result.hint.rule === 'cage-combinations') {
      expect(sudokuHintLesson(result.hint, true)?.path).toBe('/learn/killer-sudoku/cage-combinations')
      expect(sudokuHintLesson({ ...result.hint, rule: 'peer' }, true)).toBeUndefined()
      return
    }
    game = applyKillerSudokuHint(board, game, result.hint)
  }
  throw Error('Expected a multi-cell cage hint')
})
