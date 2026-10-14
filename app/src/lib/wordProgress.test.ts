import { afterEach, describe, expect, it, vi } from 'vitest'
import { WordGrid } from '../domain/wordPaths'
import { createWordGame, submitWord, traceCell } from '../domain/wordGame'
import { readWordProgress, storeWordProgress, clearWordProgress } from './wordProgress'

const grid = new WordGrid(4, 2, ['C', 'A', 'T', null, 'L', 'I', 'O', 'N'], [3, 4])
const id = '2026-10-14-words'
afterEach(() => vi.unstubAllGlobals())
function memory() {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  })
  return values
}
const partial = () => traceCell(submitWord({ ...createWordGame(grid), trace: [0, 1, 2] }).game, 4)

describe('Word Paths progress', () => {
  it('restores accepted words, unfinished trace and active time', () => {
    memory()
    expect(storeWordProgress(id, partial(), 4321)).toBe(true)
    expect(readWordProgress(id, grid)).toEqual({ game: partial(), elapsedMs: 4321 })
  })
  it('keeps preview progress separate from a daily attempt', () => {
    const values = memory()
    storeWordProgress(id, partial(), 1000, true)
    expect(readWordProgress(id, grid)).toBeNull()
    storeWordProgress(id, createWordGame(grid), 2000)
    expect(readWordProgress(id, grid, true)?.elapsedMs).toBe(1000)
    clearWordProgress(id, true)
    expect(values.size).toBe(1)
  })
  it.each([
    { version: 99 }, { board: 'stale' }, { elapsedMs: -1 }, { elapsedMs: 0.5 },
    { words: [[0, 1, 0]] }, { words: [[2, 1, 0]] }, { words: [[0, 1, 2], [0, 1, 2]] },
    { trace: [3] }, { trace: [0] }, { trace: [4, 6] }, { trace: ['4'] },
  ])('rejects invalid saved data %j', (override) => {
    const values = memory()
    storeWordProgress(id, partial(), 1000)
    const [key, raw] = [...values][0]!
    values.set(key, JSON.stringify({ ...JSON.parse(raw), ...override }))
    expect(readWordProgress(id, grid)).toBeNull()
  })
  it('rejects corrupt JSON and tolerates unavailable storage', () => {
    const values = memory()
    storeWordProgress(id, partial(), 1000)
    values.set([...values.keys()][0]!, '{')
    expect(readWordProgress(id, grid)).toBeNull()
    vi.stubGlobal('localStorage', { getItem: () => { throw Error() }, setItem: () => { throw Error() }, removeItem: () => { throw Error() } })
    expect(readWordProgress(id, grid)).toBeNull()
    expect(storeWordProgress(id, partial(), 1000)).toBe(false)
    expect(() => clearWordProgress(id)).not.toThrow()
  })
  it('clears completed snapshots and rejects foreign IDs', () => {
    const values = memory()
    storeWordProgress(id, partial(), 1000)
    const solved = submitWord({ ...partial(), trace: [4, 5, 6, 7] }).game
    expect(storeWordProgress(id, solved, 2000)).toBe(true)
    expect(values.size).toBe(0)
    expect(storeWordProgress('2026-10-14-tracks', partial(), 1000)).toBe(false)
  })
})
