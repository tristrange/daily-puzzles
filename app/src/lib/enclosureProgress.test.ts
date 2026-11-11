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
