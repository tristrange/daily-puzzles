import { afterEach, expect, it, vi } from 'vitest'
import raw from '../data/trio-previews.json'
import { createTrioGame, editTrio, parseTrioBoard } from '../domain/trio'
import { readTrioProgress, storeTrioProgress } from './trioProgress'

afterEach(() => vi.unstubAllGlobals())
it('restores per-board cells, notes and time, rejecting corrupted or stale progress', () => {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v) })
  const board = parseTrioBoard(raw[0]), other = parseTrioBoard(raw[1])
  const cell = board.givens.indexOf(0)
  const game = editTrio(board, createTrioGame(board), cell, { note: 2, enabled: true })
  expect(storeTrioProgress(board, game, 4321)).toBe(true)
  expect(readTrioProgress(board)).toEqual({ game, elapsedMs: 4321 })
  expect(readTrioProgress(other)).toBeNull()
  const [key, value] = [...values][0]!
  const saved = JSON.parse(value)
  values.set(key, JSON.stringify({ ...saved, cells: Array(81).fill(0) }))
  expect(readTrioProgress(board)).toBeNull()
  values.set(key, JSON.stringify({ ...saved, elapsedMs: -1 }))
  expect(readTrioProgress(board)).toBeNull()
  values.set(key, JSON.stringify({ ...saved, notes: Array(81).fill(8) }))
  expect(readTrioProgress(board)).toBeNull()
  values.set(key, value)
  expect(readTrioProgress({ ...board, relations: [] })).toBeNull()
  values.set(key, '{')
  expect(readTrioProgress(board)).toBeNull()
})
it('keeps play usable when storage is unavailable', () => {
  vi.stubGlobal('localStorage', { getItem: () => { throw Error() }, setItem: () => { throw Error() } })
  const board = parseTrioBoard(raw[0])
  expect(readTrioProgress(board)).toBeNull()
  expect(storeTrioProgress(board, createTrioGame(board), 0)).toBe(false)
})

it('keeps daily hints and attempts separate from all preview data', () => {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) })
  const preview = parseTrioBoard(raw[0])
  const daily = { ...preview, id: '2026-10-18-trio' }
  const game = createTrioGame(preview)
  storeTrioProgress(preview, game, 123)
  const previewBefore = values.get(`daily-puzzles.trio-preview.v1.${preview.id}`)
  expect(storeTrioProgress(daily, game, 456, true, 3)).toBe(true)
  expect(readTrioProgress(daily, true)).toEqual({ game, elapsedMs: 456, hints: 3 })
  expect(readTrioProgress(daily)).toBeNull()
  expect(readTrioProgress(preview, true)).toBeNull()
  expect(readTrioProgress(preview)).toEqual({ game, elapsedMs: 123 })
  expect(values.get(`daily-puzzles.trio-preview.v1.${preview.id}`)).toBe(previewBefore)
  const dailyKey = `daily-puzzles.trio.v1.${daily.id}`
  const stored = JSON.parse(values.get(dailyKey)!)
  values.set(dailyKey, JSON.stringify({ ...stored, hints: -1 }))
  expect(readTrioProgress(daily, true)).toBeNull()
  expect(storeTrioProgress(daily, game, 0, true, -1)).toBe(false)
})
