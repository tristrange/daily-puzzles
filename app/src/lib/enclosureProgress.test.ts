import { expect, test, vi } from 'vitest'
import { EnclosureGrid } from '../domain/enclosure'
import { clearEnclosureProgress, readEnclosureProgress, storeEnclosureProgress } from './enclosureProgress'
const id = '2026-11-11-enclosure'
const grid = new EnclosureGrid(3, [], 4, 4)
test('reloads enclosed layout and rejects changed board', () => {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) })
  const game = { grid, walls: [1, 3, 5, 7] }
  expect(storeEnclosureProgress(id, game, { elapsedMs: 10, attemptElapsedMs: 3 })).toBe(true)
  expect(readEnclosureProgress(id, grid)).toEqual({ game, elapsedMs: 10, attemptElapsedMs: 3 })
  expect(readEnclosureProgress(id, new EnclosureGrid(3, [0], 4, 4))).toBeNull()
  clearEnclosureProgress(id)
  vi.unstubAllGlobals()
})
test('storage refusal is reported', () => {
  vi.stubGlobal('localStorage', { setItem: () => { throw new Error('quota') } })
  expect(storeEnclosureProgress(id, { grid, walls: [] }, { elapsedMs: 0 })).toBe(false)
  vi.unstubAllGlobals()
})
test('restores only a valid preview best for the same board', () => {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) })
  const game = { grid, walls: [1, 3, 5, 7] }
  const previewBest = { score: 1, walls: game.walls, board: JSON.stringify([3, [], 4, 4, null]), achievedAt: 10 }
  expect(storeEnclosureProgress(id, game, { elapsedMs: 100 }, previewBest)).toBe(true)
  expect(readEnclosureProgress(id, grid)?.previewBest).toEqual(previewBest)
  const raw = JSON.parse(values.get(`daily-puzzles.enclosure-progress.${id}`)!)
  raw.previewBest.score = 2
  values.set(`daily-puzzles.enclosure-progress.${id}`, JSON.stringify(raw))
  expect(readEnclosureProgress(id, grid)?.previewBest).toBeUndefined()
  expect(readEnclosureProgress(id, grid)?.game.walls).toEqual(game.walls)
  expect(storeEnclosureProgress(id, game, { elapsedMs: 100 }, { ...previewBest, board: 'wrong' })).toBe(false)
  vi.unstubAllGlobals()
})
