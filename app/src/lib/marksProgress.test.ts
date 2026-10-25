import { afterEach, describe, expect, it, vi } from 'vitest'
import queen from '@shared/conformance/hint-cases/2026-05-11.puzzle.json'
import otherQueen from '@shared/conformance/hint-cases/2026-05-12.puzzle.json'
import star from '@shared/conformance/hint-cases/2026-10-08-star.puzzle.json'
import { marksBoard } from '../domain/helpers'
import { isSolved, type GameState } from '../domain/game'
import { parsePuzzle } from '../domain/puzzle'
import {
  clearMarksProgress,
  readMarksProgress,
  storeMarksProgress,
} from './marksProgress'

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

const queenPuzzle = parsePuzzle(queen), queenBoard = marksBoard(queenPuzzle)
const otherQueenBoard = marksBoard(parsePuzzle(otherQueen))
const starPuzzle = parsePuzzle(star), starBoard = marksBoard(starPuzzle)
const queenGame: GameState = { board: queenBoard, queens: new Set([3]), marks: new Set([5]) }
const starGame: GameState = { board: starBoard, queens: new Set([0, 2]), marks: new Set([1]) }

describe('marks progress', () => {
  it('restores queens, crosses, shown hints and elapsed time under the full ID', () => {
    const values = memoryStorage()
    expect(storeMarksProgress(queenPuzzle.id, queenGame, { elapsedMs: 1234 }, 2)).toBe(true)
    expect(readMarksProgress(queenPuzzle.id, queenBoard)).toEqual({
      game: queenGame,
      elapsedMs: 1234,
      hints: 2,
    })
    expect(storeMarksProgress(starPuzzle.id, starGame, { elapsedMs: 4321 }, 1)).toBe(true)
    expect(readMarksProgress(starPuzzle.id, starBoard)).toEqual({
      game: starGame,
      elapsedMs: 4321,
      hints: 1,
    })
    expect(values.size).toBe(2)
    clearMarksProgress(queenPuzzle.id)
    expect(readMarksProgress(queenPuzzle.id, queenBoard)).toBeNull()
    expect(readMarksProgress(starPuzzle.id, starBoard)).not.toBeNull()
  })

  it('rejects a different board, the wrong family, and a foreign ID', () => {
    memoryStorage()
    storeMarksProgress(queenPuzzle.id, queenGame, { elapsedMs: 1000 })
    expect(readMarksProgress(queenPuzzle.id, otherQueenBoard)).toBeNull()
    expect(readMarksProgress(queenPuzzle.id, starBoard)).toBeNull()
    expect(readMarksProgress('2026-10-14-tracks', queenBoard)).toBeNull()
    expect(storeMarksProgress(queenPuzzle.id, starGame, { elapsedMs: 1000 })).toBe(false)
    expect(storeMarksProgress(starPuzzle.id, queenGame, { elapsedMs: 1000 })).toBe(false)
  })

  it('reads an old snapshot without a hint count as zero', () => {
    const values = memoryStorage()
    storeMarksProgress(queenPuzzle.id, queenGame, { elapsedMs: 1000 }, 3)
    const [key, raw] = [...values][0]!
    const saved = JSON.parse(raw)
    delete saved.hints
    values.set(key, JSON.stringify(saved))
    expect(readMarksProgress(queenPuzzle.id, queenBoard)?.hints).toBe(0)
  })

  it.each([
    ['version', { version: 2 }],
    ['board', { board: 'different' }],
    ['elapsed as negative', { elapsedMs: -1 }],
    ['elapsed as fractional', { elapsedMs: 0.5 }],
    ['elapsed as text', { elapsedMs: '1000' }],
    ['negative hints', { hints: -1 }],
    ['fractional hints', { hints: 0.5 }],
    ['text hints', { hints: '2' }],
    ['duplicate queen', { queens: [3, 3] }],
    ['out-of-range queen', { queens: [999] }],
    ['text cell', { queens: ['3'] }],
    ['missing marks', { marks: null }],
    ['overlapping mark', { marks: [3] }],
  ])('rejects an invalid %s snapshot', (_, override) => {
    const values = memoryStorage()
    storeMarksProgress(queenPuzzle.id, queenGame, { elapsedMs: 1000 })
    const [key, raw] = [...values][0]!
    values.set(key, JSON.stringify({ ...JSON.parse(raw), ...override }))
    expect(readMarksProgress(queenPuzzle.id, queenBoard)).toBeNull()
  })

  it('rejects corrupt JSON and tolerates unavailable storage', () => {
    const values = memoryStorage()
    storeMarksProgress(queenPuzzle.id, queenGame, { elapsedMs: 1000 })
    values.set([...values.keys()][0]!, '{')
    expect(readMarksProgress(queenPuzzle.id, queenBoard)).toBeNull()
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
      removeItem: () => { throw new Error('blocked') },
    })
    expect(readMarksProgress(queenPuzzle.id, queenBoard)).toBeNull()
    expect(storeMarksProgress(queenPuzzle.id, queenGame, { elapsedMs: 1000 })).toBe(false)
    expect(() => clearMarksProgress(queenPuzzle.id)).not.toThrow()
  })

  it('clears a solved snapshot and refuses to store another one', () => {
    const values = memoryStorage()
    storeMarksProgress(queenPuzzle.id, queenGame, { elapsedMs: 1000 })
    const [key, raw] = [...values][0]!
    values.set(key, JSON.stringify({
      ...JSON.parse(raw),
      queens: [3, 5, 12, 19, 21],
      marks: [],
    }))
    expect(readMarksProgress(queenPuzzle.id, queenBoard)).toBeNull()
    expect(values.size).toBe(0)

    storeMarksProgress(queenPuzzle.id, queenGame, { elapsedMs: 1000 })
    const solved: GameState = {
      board: queenBoard,
      queens: new Set([3, 5, 12, 19, 21]),
      marks: new Set(),
    }
    expect(isSolved(solved)).toBe(true)
    expect(storeMarksProgress(queenPuzzle.id, solved, { elapsedMs: 2000 }, 1)).toBe(true)
    expect(values.size).toBe(0)
  })

  it('rejects invalid durations and hint counts instead of writing them', () => {
    memoryStorage()
    expect(storeMarksProgress(queenPuzzle.id, queenGame, { elapsedMs: -1 })).toBe(false)
    expect(storeMarksProgress(queenPuzzle.id, queenGame, { elapsedMs: 0.5 })).toBe(false)
    expect(storeMarksProgress(queenPuzzle.id, queenGame, { elapsedMs: 1000 }, -1)).toBe(false)
    expect(storeMarksProgress(queenPuzzle.id, queenGame, { elapsedMs: 1000 }, 0.5)).toBe(false)
  })
})
