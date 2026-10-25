import { afterEach, expect, it, vi } from 'vitest'
import raw from '../data/nurikabe-previews.json'
import proof from '@shared/docs/measurements/nurikabe-preview.json'
import { createNurikabeGame, editNurikabeCell, parseNurikabeBoards, type NurikabeGame } from '../domain/nurikabe'
import { readNurikabeProgress, storeNurikabeProgress } from './nurikabeProgress'

const boards = parseNurikabeBoards(raw), board = boards[0]!
afterEach(() => vi.unstubAllGlobals())
it('restores only this exact unfinished preview and clears completion without touching other saves', () => {
  const values = new Map<string, string>([['daily-puzzles.stats', 'keep']])
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) })
  const game = editNurikabeCell(board, createNurikabeGame(board), 1, 1)
  expect(storeNurikabeProgress(board, game, { elapsedMs: 4321 })).toBe(true)
  expect(readNurikabeProgress(board)).toEqual({ game, elapsedMs: 4321 })
  expect(readNurikabeProgress(boards[1]!)).toBeNull()
  const key = `daily-puzzles.nurikabe-preview.v1.${board.id}`
  const saved = { version: 1, board: JSON.stringify([board.size, board.clues]), game, elapsedMs: 4321 }
  for (const change of [{ elapsedMs: -1 }, { elapsedMs: 1.5 }, { version: 2 }, { board: 'old' }, { game: [0] },
    { game: game.map((mark, cell) => cell === 0 ? 1 : mark) }, { game: Array(25).fill(3) }]) {
    values.set(key, JSON.stringify({ ...saved, ...change }))
    expect(readNurikabeProgress(board)).toBeNull()
  }
  const solution: NurikabeGame = proof.samples[0]!.solution.map((mark, cell) => mark === 0 ? 1 : board.clues[cell] ? 2 : 0)
  values.set(key, JSON.stringify({ ...saved, game: solution }))
  expect(readNurikabeProgress(board)).toBeNull()
  expect(storeNurikabeProgress(board, solution, { elapsedMs: 5000 })).toBe(true)
  expect(values.has(key)).toBe(false)
  expect(values.get('daily-puzzles.stats')).toBe('keep')
  values.set(key, '{')
  expect(readNurikabeProgress(board)).toBeNull()
})

it('reports blocked storage without preventing play', () => {
  vi.stubGlobal('localStorage', { getItem: () => { throw Error() }, setItem: () => { throw Error() } })
  expect(readNurikabeProgress(board)).toBeNull()
  expect(storeNurikabeProgress(board, createNurikabeGame(board), { elapsedMs: 0 })).toBe(false)
})
