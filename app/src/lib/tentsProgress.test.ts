import { afterEach, expect, it, vi } from 'vitest'
import raw from '../data/tents-previews.json'
import { createTentsGame, editTent, parseTentsBoard } from '../domain/tents'
import { readTentsProgress, storeTentsProgress } from './tentsProgress'

afterEach(() => vi.unstubAllGlobals())
it('restores only valid unfinished attempts for this exact preview board', () => {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => values.set(k, v), removeItem: (k: string) => values.delete(k) })
  const board = parseTentsBoard(raw[0]), game = editTent(board, createTentsGame(board), 0, 2)
  expect(storeTentsProgress(board, game, { elapsedMs: 4321 }, 2)).toBe(true)
  expect(readTentsProgress(board)).toEqual({ game, elapsedMs: 4321, hints: 2 })
  expect(readTentsProgress(parseTentsBoard(raw[1]))).toBeNull()
  const [key, text] = [...values][0]!, saved = JSON.parse(text)
  for (const change of [{ elapsedMs: -1 }, { hints: 0.1 }, { game: [0] }, { game: Array(64).fill(3) },
    { game: game.map((v, cell) => cell === board.trees[0] ? 2 : v) }]) {
    values.set(key, JSON.stringify({ ...saved, ...change }))
    expect(readTentsProgress(board)).toBeNull()
  }
  values.set(key, text)
  expect(readTentsProgress({ ...board, trees: [...board.trees].reverse() })).toBeNull()
  values.set(key, '{')
  expect(readTentsProgress(board)).toBeNull()
})

it('keeps play usable when storage is blocked', () => {
  vi.stubGlobal('localStorage', { getItem: () => { throw Error() }, setItem: () => { throw Error() } })
  const board = parseTentsBoard(raw[0])
  expect(readTentsProgress(board)).toBeNull()
  expect(storeTentsProgress(board, createTentsGame(board), { elapsedMs: 0 }, 0)).toBe(false)
})
