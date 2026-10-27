import { expect, it } from 'vitest'
import easy from '../../public/puzzles/2026-10-27-killer-sudoku-easy.json'
import medium from '../../public/puzzles/2026-10-27-killer-sudoku-medium.json'
import hard from '../../public/puzzles/2026-10-27-killer-sudoku-hard.json'
import { parsePuzzle, isSudokuPuzzle } from './puzzle'
import { isKillerSudokuBoard, isKillerSolved } from './killerSudoku'
import { createSudokuGame } from './sudoku'
import { applyKillerSudokuHint, findKillerSudokuHint, solveKillerSudoku } from './killerSudokuHints'
import { puzzleIdsForDay, puzzleTypeOf } from './dates'

it('publishes three separate daily levels that the app can solve with its hints', () => {
  const boards = [easy, medium, hard]
  expect(puzzleIdsForDay('2026-10-26').some(id => id.includes('killer-sudoku'))).toBe(false)
  expect(puzzleIdsForDay('2026-10-27').filter(id => id.includes('killer-sudoku'))).toEqual(boards.map(board => board.id))
  for (const raw of boards) {
    const puzzle = parsePuzzle(raw)
    expect(puzzleTypeOf(puzzle.id)).toBe('killer-sudoku')
    if (!isSudokuPuzzle(puzzle) || !isKillerSudokuBoard(puzzle.board)) throw Error('Expected a Killer Sudoku')
    const board = puzzle.board
    expect(solveKillerSudoku(board).kind).toBe('unique')
    let game = createSudokuGame(board)
    for (let round = 0; round < 500 && !isKillerSolved(board, game.cells); round++) {
      const hint = findKillerSudokuHint(board, game)
      if (hint.kind !== 'hint') throw Error(`No supported hint for ${puzzle.id}: ${hint.kind}`)
      game = applyKillerSudokuHint(board, game, hint.hint)
    }
    expect(isKillerSolved(board, game.cells)).toBe(true)
  }
})

it('rejects a daily level with the wrong id or invalid cages', () => {
  expect(() => parsePuzzle({ ...easy, id: easy.id.replace('easy', 'hard') })).toThrow()
  expect(() => parsePuzzle({ ...easy, board: { ...easy.board, cages: easy.board.cages.slice(1) } })).toThrow()
})
