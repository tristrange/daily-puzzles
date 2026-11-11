import { expect, test, vi } from 'vitest'
import { EnclosureGrid, enclosureFingerprint } from '../domain/enclosure'
import { addSolve, importStoredStats, parseStats, readStoredStats, storeEnclosureResult, type SolveRecord } from './stats'
const grid = new EnclosureGrid(3, [], 4, 4)
const first: SolveRecord = { id: '2026-11-11-enclosure', puzzleType: 'enclosure', size: 3, elapsedMs: 100, hints: 0, solvedAt: 1 }
const best = { score: 1, walls: [1, 3, 5, 7], board: enclosureFingerprint(grid), achievedAt: 2 }
test('legacy records survive and malformed best is discarded', () => {
  expect(parseStats(JSON.stringify([{ ...first, enclosureBest: { ...best, score: 100 } }]))).toEqual([first])
})
test('first completion and best merge independently', () => {
  expect(addSolve([first], { ...first, elapsedMs: 999, solvedAt: 10, enclosureBest: best })).toEqual([{ ...first, enclosureBest: best }])
})
test('new result preserves another board best and completion', async () => {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) })
  const stale = new EnclosureGrid(3, [0], 4, 4)
  localStorage.setItem('daily-puzzles:stats', JSON.stringify([{ ...first, enclosureBest: { ...best, board: enclosureFingerprint(stale) } }]))
  const result = storeEnclosureResult({ ...first, solvedAt: 10, enclosureBest: best }, grid)
  const { validatedEnclosureBest } = await import('./enclosureResults')
  expect(validatedEnclosureBest(result[0], grid)).toEqual(best)
  expect(validatedEnclosureBest(result[0], stale)).toEqual({ ...best, board: enclosureFingerprint(stale) })
  expect(result[0]?.solvedAt).toBe(first.solvedAt)
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

test('keeps each board best across import order and repeated normalization', async () => {
  const { validatedEnclosureBest } = await import('./enclosureResults')
  const staleGrid = new EnclosureGrid(5, [], 12, 6)
  const staleBest = { score: 2, walls: [2, 6, 8, 11, 13, 17], board: enclosureFingerprint(staleGrid), achievedAt: 4 }
  const current = { ...first, enclosureBest: best }
  const stale = { ...first, size: 5, solvedAt: 2, enclosureBest: staleBest }
  let canonical: readonly SolveRecord[] | undefined
  for (const inputs of [[current, stale], [stale, current]]) {
    const normalized = parseStats(JSON.stringify(inputs))
    expect(validatedEnclosureBest(normalized[0], grid)).toEqual(best)
    expect(validatedEnclosureBest(normalized[0], staleGrid)).toEqual(staleBest)
    expect(parseStats(JSON.stringify(normalized))).toEqual(normalized)
    if (canonical) expect(normalized).toEqual(canonical)
    canonical = normalized
  }
})

test('a best survives round trips when completion size differs from its board', async () => {
  const { validatedEnclosureBest } = await import('./enclosureResults')
  const records = parseStats(JSON.stringify([{ ...first, size: 5 }, { ...first, solvedAt: 3, enclosureBest: best }]))
  const roundTrip = parseStats(JSON.stringify(records))
  expect(roundTrip).toEqual(records)
  expect(roundTrip[0]?.size).toBe(5)
  expect(validatedEnclosureBest(roundTrip[0], grid)).toEqual(best)
})

test('equal scores use deterministic wall and time tie breaks in either order', () => {
  const earlier = { ...best, achievedAt: 1 }
  const later = { ...best, achievedAt: 5 }
  for (const values of [[earlier, later], [later, earlier]]) {
    const records = values.map(enclosureBest => ({ ...first, enclosureBest }))
    expect(parseStats(JSON.stringify(records))).toEqual([{ ...first, enclosureBest: earlier }])
  }
})

test('submission preserves imported board results through backup round trip', async () => {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) })
  const otherGrid = new EnclosureGrid(5, [], 12, 6)
  const otherBest = { score: 2, walls: [2, 6, 8, 11, 13, 17], board: enclosureFingerprint(otherGrid), achievedAt: 4 }
  importStoredStats(JSON.stringify([{ ...first, enclosureBest: best }, { ...first, size: 5, solvedAt: 3, enclosureBest: otherBest }]))
  storeEnclosureResult({ ...first, solvedAt: 9, enclosureBest: { ...best, achievedAt: 9 } }, grid)
  const stored = readStoredStats()
  const roundTrip = parseStats(JSON.stringify(stored))
  const { validatedEnclosureBest } = await import('./enclosureResults')
  for (const records of [stored, roundTrip]) {
    expect(validatedEnclosureBest(records[0], grid)).toEqual(best)
    expect(validatedEnclosureBest(records[0], otherGrid)).toEqual(otherBest)
    expect(records[0]?.solvedAt).toBe(first.solvedAt)
  }
  vi.unstubAllGlobals()
})
