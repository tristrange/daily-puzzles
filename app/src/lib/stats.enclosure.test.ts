import { expect, test, vi } from 'vitest'
import { EnclosureGrid, enclosureFingerprint } from '../domain/enclosure'
import { addSolve, parseStats, storeEnclosureResult, type SolveRecord } from './stats'
const grid = new EnclosureGrid(3, [], 4, 4)
const first: SolveRecord = { id: '2026-11-11-enclosure', puzzleType: 'enclosure', size: 3, elapsedMs: 100, hints: 0, solvedAt: 1 }
const best = { score: 1, walls: [1, 3, 5, 7], board: enclosureFingerprint(grid), achievedAt: 2 }
test('legacy records survive and malformed best is discarded', () => {
  expect(parseStats(JSON.stringify([{ ...first, enclosureBest: { ...best, score: 100 } }]))).toEqual([first])
})
test('first completion and best merge independently', () => {
  expect(addSolve([first], { ...first, elapsedMs: 999, solvedAt: 10, enclosureBest: best })).toEqual([{ ...first, enclosureBest: best }])
})
test('new result replaces stale board best and preserves completion', () => {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) })
  const stale = new EnclosureGrid(3, [0], 4, 4)
  localStorage.setItem('daily-puzzles:stats', JSON.stringify([{ ...first, enclosureBest: { ...best, board: enclosureFingerprint(stale) } }]))
  expect(storeEnclosureResult({ ...first, solvedAt: 10, enclosureBest: best }, grid)).toEqual([{ ...first, enclosureBest: best }])
  vi.unstubAllGlobals()
})
test('merges the higher verified score independently of completion order', () => {
  const larger = new EnclosureGrid(5, [], 12, 6)
  const board = enclosureFingerprint(larger)
  const small = { score: 1, walls: [7, 11, 13, 17], board, achievedAt: 1 }
  const large = { score: 2, walls: [2, 6, 8, 11, 13, 17], board, achievedAt: 3 }
  const early = { ...first, size: 5, enclosureBest: small }
  const later = { ...first, size: 5, elapsedMs: 500, solvedAt: 3, enclosureBest: large }
  expect(parseStats(JSON.stringify([later, early]))).toEqual([{ ...early, enclosureBest: large }])
})
