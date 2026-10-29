import { expect, it } from 'vitest'
import raw from '../data/sudoku-previews.json'
import { parsePuzzle } from './puzzle'
import { isPuzzleId, puzzleIdFor, puzzleIdsForDay, puzzleTypeOf } from './dates'

const envelope = { id: '2026-10-21-sudoku-easy', type: 'sudoku', seed: 123, generatorVersion: 1,
  board: { size: 9, level: 'easy', givens: raw[0]!.givens } }

it('parses daily Sudoku geometry and rejects identity, givens and version mismatches', () => {
  const puzzle = parsePuzzle(envelope)
  expect(puzzle.board).toMatchObject({ id: envelope.id, level: 'easy', size: 9, width: 9, height: 9, cellCount: 81 })
  expect(puzzle.difficulty).toBeNull()
  for (const change of [{ id: 'sudoku-preview-1' }, { id: '2026-10-21-sudoku' }, { id: '2026-02-30-sudoku-easy' },
    { id: '2026-10-21-sudoku-hard' }, { generatorVersion: 2 }, { difficulty: 1 },
    { board: { ...envelope.board, givens: [1] } }, { board: { ...envelope.board, givens: Array(81).fill(1) } },
    { board: { ...envelope.board, solution: [] } }]) expect(() => parsePuzzle({ ...envelope, ...change })).toThrow()
})

it('publishes three separately identified levels from the archive start, never an unsized slot', () => {
  expect(isPuzzleId('2026-10-21-sudoku')).toBe(false)
  expect(puzzleIdsForDay('2026-09-25').filter(id => puzzleTypeOf(id) === 'sudoku')).toEqual([])
  expect(puzzleIdsForDay('2026-09-26').filter(id => puzzleTypeOf(id) === 'sudoku')).toEqual(
    ['easy', 'medium', 'hard'].map(level => `2026-09-26-sudoku-${level}`),
  )
  const ids = ['easy', 'medium', 'hard'].map(level => `2026-10-21-sudoku-${level}`)
  expect(puzzleIdsForDay('2026-10-21').filter(id => puzzleTypeOf(id) === 'sudoku')).toEqual(ids)
  for (const id of ids) expect(puzzleTypeOf(id)).toBe('sudoku')
  expect(puzzleIdFor('2026-10-21', 'sudoku')).toBe(ids[0])
  expect(puzzleIdFor('2026-10-21', 'sudoku', undefined, 'hard')).toBe(ids[2])
})
