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
    expect(storeWordProgress(id, partial(), { elapsedMs: 4321 })).toBe(true)
    expect(readWordProgress(id, grid)).toEqual({ game: partial(), elapsedMs: 4321, hints: 0 })
  })
  it('keeps preview progress separate from a daily attempt', () => {
    const values = memory()
    storeWordProgress(id, partial(), { elapsedMs: 1000 }, true)
    expect(readWordProgress(id, grid)).toBeNull()
    storeWordProgress(id, createWordGame(grid), { elapsedMs: 2000 })
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
    storeWordProgress(id, partial(), { elapsedMs: 1000 })
    const [key, raw] = [...values][0]!
    values.set(key, JSON.stringify({ ...JSON.parse(raw), ...override }))
    expect(readWordProgress(id, grid)).toBeNull()
  })
  it('rejects corrupt JSON and tolerates unavailable storage', () => {
    const values = memory()
    storeWordProgress(id, partial(), { elapsedMs: 1000 })
    values.set([...values.keys()][0]!, '{')
    expect(readWordProgress(id, grid)).toBeNull()
    vi.stubGlobal('localStorage', { getItem: () => { throw Error() }, setItem: () => { throw Error() }, removeItem: () => { throw Error() } })
    expect(readWordProgress(id, grid)).toBeNull()
    expect(storeWordProgress(id, partial(), { elapsedMs: 1000 })).toBe(false)
    expect(() => clearWordProgress(id)).not.toThrow()
  })
  it('clears completed snapshots and rejects foreign IDs', () => {
    const values = memory()
    storeWordProgress(id, partial(), { elapsedMs: 1000 })
    const solved = submitWord({ ...partial(), trace: [4, 5, 6, 7] }).game
    expect(storeWordProgress(id, solved, { elapsedMs: 2000 })).toBe(true)
    expect(values.size).toBe(0)
    expect(storeWordProgress('2026-10-14-tracks', partial(), { elapsedMs: 1000 })).toBe(false)
  })
})

it('restores shown hints, reads legacy attempts as zero, and rejects corrupt counts', () => {
  const values = memory()
  expect(storeWordProgress(id, partial(), { elapsedMs: 1000 }, false, 3)).toBe(true)
  expect(readWordProgress(id, grid)?.hints).toBe(3)
  const [key, raw] = [...values][0]!
  const legacy = JSON.parse(raw)
  delete legacy.hints
  values.set(key, JSON.stringify(legacy))
  expect(readWordProgress(id, grid)?.hints).toBe(0)
  for (const hints of [-1, 0.5, '2', null, Number.MAX_SAFE_INTEGER + 1]) {
    values.set(key, JSON.stringify({ ...legacy, hints }))
    expect(readWordProgress(id, grid)).toBeNull()
  }
  expect(storeWordProgress(id, partial(), { elapsedMs: 1000 }, false, -1)).toBe(false)
})


it('preserves v1 attempts when the same board receives v2 acceptance', () => {
  const values = memory()
  storeWordProgress(id, partial(), { elapsedMs: 4321 }, true)
  const original = values.get(`daily-puzzles.word-progress.preview.${id}`)
  const expanded = new WordGrid(grid.width, grid.height, grid.letters, grid.wordLengths, 2)
  expect(readWordProgress(id, expanded, true)).toBeNull()
  storeWordProgress(id, createWordGame(expanded), { elapsedMs: 2000 }, true)
  expect(readWordProgress(id, grid, true)?.elapsedMs).toBe(4321)
  expect(readWordProgress(id, expanded, true)?.elapsedMs).toBe(2000)
  expect(values.get(`daily-puzzles.word-progress.preview.${id}`)).toBe(original)
  clearWordProgress(id, true, 2)
  expect(readWordProgress(id, grid, true)?.elapsedMs).toBe(4321)
  expect(readWordProgress(id, expanded, true)).toBeNull()
})

it('keeps version 3 attempts separate from earlier versions', () => {
  const values = memory()
  storeWordProgress(id, partial(), { elapsedMs: 1000 }, true)
  const current = new WordGrid(grid.width, grid.height, grid.letters, grid.wordLengths, 3)
  storeWordProgress(id, createWordGame(current), { elapsedMs: 2000 }, true)
  expect(readWordProgress(id, grid, true)?.elapsedMs).toBe(1000)
  expect(readWordProgress(id, current, true)?.elapsedMs).toBe(2000)
  clearWordProgress(id, true, 3)
  expect(readWordProgress(id, current, true)).toBeNull()
  expect(values.size).toBe(1)
})
