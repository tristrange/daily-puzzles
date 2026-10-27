import { afterEach, expect, it, vi } from 'vitest'
import raw from '../data/sudoku-previews.json'
import { createSudokuGame, editSudoku, parseSudokuBoards } from '../domain/sudoku'
import { readSudokuProgress, storeSudokuProgress } from './sudokuProgress'
afterEach(() => vi.unstubAllGlobals())
it('isolates validated preview attempts and preserves notes, active time and shown hints', () => {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) })
  const [board, other] = parseSudokuBoards(raw)
  const game = editSudoku(board!, createSudokuGame(board!), board!.givens.indexOf(0), 9, true)
  expect(storeSudokuProgress(board!, game, { elapsedMs: 4321 }, 2)).toBe(true)
  expect(readSudokuProgress(board!)).toEqual({ game, elapsedMs: 4321, hints: 2 })
  expect(readSudokuProgress(other!)).toBeNull()
  const [key, value] = [...values][0]!, saved = JSON.parse(value)
  for (const change of [{ hints: -1 }, { elapsedMs: 1.5 }, { board: 'stale' }, { notes: [512] }, { cells: Array(81).fill(0) }]) {
    values.set(key, JSON.stringify({ ...saved, ...change }))
    expect(readSudokuProgress(board!)).toBeNull()
  }
  vi.stubGlobal('localStorage', { getItem: () => { throw Error('blocked') }, setItem: () => { throw Error('blocked') } })
  expect(readSudokuProgress(board!)).toBeNull()
  expect(storeSudokuProgress(board!, game, { elapsedMs: 4321 }, 2)).toBe(false)
})

it('keeps daily levels separate from previews and rejects stale daily fingerprints', () => {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) })
  const preview = parseSudokuBoards(raw)[0]!
  const board = { ...preview, id: '2026-10-21-sudoku-easy' }
  const game = editSudoku(board, createSudokuGame(board), board.givens.indexOf(0), 9, true)
  storeSudokuProgress(preview, game, { elapsedMs: 1000 }, 1)
  storeSudokuProgress(board, game, { elapsedMs: 2000 }, 2, true)
  expect(readSudokuProgress(board, true)).toEqual({ game, elapsedMs: 2000, hints: 2 })
  expect(values.has(`daily-puzzles.sudoku.v1.${board.id}`)).toBe(true)
  expect(readSudokuProgress(board)).toBeNull()
  expect(readSudokuProgress({ ...board, level: 'hard' }, true)).toBeNull()
  expect(readSudokuProgress({ ...board, id: '2026-10-21-sudoku-medium' }, true)).toBeNull()
  expect(readSudokuProgress(preview)?.elapsedMs).toBe(1000)
})

it('preserves old Killer preview progress and ignores corrupted combination marks without losing moves', async () => {
  const { parseKillerPreviews } = await import('../domain/killerSudoku')
  const rawKiller = (await import('../data/killer-sudoku-previews.json')).default
  const board = parseKillerPreviews(rawKiller)[0]!, values = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) })
  const game = editSudoku(board, createSudokuGame(board), 0, 6)
  storeSudokuProgress(board, game, { elapsedMs: 1234 }, 1)
  expect(readSudokuProgress(board)?.game).toEqual(game)
  const [key, json] = [...values][0]!, saved = JSON.parse(json)
  values.set(key, JSON.stringify({ ...saved, excludedCageCombinations: [[999]] }))
  expect(readSudokuProgress(board)?.game).toEqual(game)
})
