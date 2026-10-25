import { afterEach, describe, expect, it, vi } from 'vitest'
import small from '../../../conformance/id-cases/tracks-small.accept.json'
import medium from '../../../conformance/id-cases/tracks-medium.accept.json'
import large from '../../../conformance/id-cases/tracks-large.accept.json'
import { parsePuzzle } from '../domain/puzzle'
import { TrackGrid } from '../domain/tracks'
import { applyBrush, createTracksGame, CROSS, MAYBE } from '../domain/tracksGame'
import { clearTrackProgress, readTrackProgress, storeTrackProgress } from './trackProgress'

afterEach(() => vi.unstubAllGlobals())

function memoryStorage() {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  })
  return values
}

function gridFor(data: unknown): TrackGrid {
  const { board } = parsePuzzle(data)
  if (!(board instanceof TrackGrid)) throw new Error('expected track grid')
  return board
}

describe('Train Tracks progress', () => {
  it('restores hint counts, accepts legacy snapshots and rejects invalid counts', () => {
    const values = memoryStorage(), grid = gridFor(small)
    storeTrackProgress(small.id, createTracksGame(grid), { elapsedMs: 1000 }, 3)
    expect(readTrackProgress(small.id, grid)?.hints).toBe(3)
    const [key, value] = [...values][0]!
    const snapshot = JSON.parse(value)
    delete snapshot.hints
    values.set(key, JSON.stringify(snapshot))
    expect(readTrackProgress(small.id, grid)?.hints).toBe(0)
    for (const hints of [-1, 1.5, '3', null]) {
      values.set(key, JSON.stringify({ ...snapshot, hints }))
      expect(readTrackProgress(small.id, grid)).toBeNull()
    }
    expect(storeTrackProgress(small.id, createTracksGame(grid), { elapsedMs: 1000 }, -1)).toBe(false)
  })
  it('keeps all three boards, notes and times under distinct full IDs', () => {
    const values = memoryStorage()
    for (const [index, data] of [small, medium, large].entries()) {
      const grid = gridFor(data)
      const free = grid.givens.flatMap((piece, cell) => piece === 0 ? [cell] : [])
      let game = applyBrush(createTracksGame(grid), free[0]!, CROSS)
      game = applyBrush(game, free[1]!, MAYBE)
      expect(storeTrackProgress(data.id, game, { elapsedMs: (index + 1) * 1000 })).toBe(true)
      const restored = readTrackProgress(data.id, grid)
      expect(restored?.game.pieces).toEqual(game.pieces)
      expect(restored?.elapsedMs).toBe((index + 1) * 1000)
    }
    expect(values.size).toBe(3)
    clearTrackProgress(medium.id)
    expect(readTrackProgress(medium.id, gridFor(medium))).toBeNull()
    expect(readTrackProgress(small.id, gridFor(small))).not.toBeNull()
    expect(readTrackProgress(large.id, gridFor(large))).not.toBeNull()
  })

  it.each([
    { version: 99 }, { board: 'different board' }, { elapsedMs: -1 },
    { elapsedMs: 'quickly' }, { pieces: [] },
  ])('ignores invalid snapshot $version $board $elapsedMs', (override) => {
    const values = memoryStorage()
    const grid = gridFor(small)
    storeTrackProgress(small.id, createTracksGame(grid), { elapsedMs: 1000 })
    const [key, value] = [...values][0]!
    values.set(key, JSON.stringify({ ...JSON.parse(value), ...override }))
    expect(readTrackProgress(small.id, grid)).toBeNull()
  })

  it('rejects changed givens and out-of-range cell values', () => {
    const values = memoryStorage()
    const grid = gridFor(small)
    for (const mutateGiven of [true, false]) {
      storeTrackProgress(small.id, createTracksGame(grid), { elapsedMs: 1000 })
      const [key, value] = [...values][0]!
      const snapshot = JSON.parse(value)
      const cell = grid.givens.findIndex((piece) => mutateGiven ? piece !== 0 : piece === 0)
      snapshot.pieces[cell] = mutateGiven ? 0 : MAYBE + 1
      values.set(key, JSON.stringify(snapshot))
      expect(readTrackProgress(small.id, grid)).toBeNull()
    }
  })

  it('restores onto an equivalent newly loaded grid, never a different one', () => {
    memoryStorage()
    const grid = gridFor(small)
    storeTrackProgress(small.id, createTracksGame(grid), { elapsedMs: 1000 })
    expect(readTrackProgress(small.id, gridFor(small))?.elapsedMs).toBe(1000)
    expect(readTrackProgress(small.id, gridFor(medium))).toBeNull()
  })

  it('ignores corrupt JSON and unavailable storage without stopping play', () => {
    const values = memoryStorage()
    const grid = gridFor(small)
    storeTrackProgress(small.id, createTracksGame(grid), { elapsedMs: 1000 })
    const key = [...values.keys()][0]!
    values.set(key, '{broken')
    expect(readTrackProgress(small.id, grid)).toBeNull()
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
      removeItem: () => { throw new Error('blocked') },
    })
    expect(readTrackProgress(small.id, grid)).toBeNull()
    expect(storeTrackProgress(small.id, createTracksGame(grid), { elapsedMs: 1000 })).toBe(false)
    expect(() => clearTrackProgress(small.id)).not.toThrow()
  })

  it('clears completed snapshots so reopening starts a replay without another solve', () => {
    const values = memoryStorage()
    const grid = new TrackGrid(3, 1, [3], [1, 1, 1], [1, 0, 1])
    const id = '2026-10-16-tracks'
    storeTrackProgress(id, createTracksGame(grid), { elapsedMs: 1000 })
    const [key, value] = [...values][0]!
    values.set(key, JSON.stringify({ ...JSON.parse(value), pieces: [1, 1, 1] }))
    expect(readTrackProgress(id, grid)).toBeNull()
    expect(values.size).toBe(0)
    storeTrackProgress(id, createTracksGame(grid), { elapsedMs: 1000 })
    storeTrackProgress(id, applyBrush(createTracksGame(grid), 1, 1), { elapsedMs: 2000 })
    expect(values.size).toBe(0)
  })
})
