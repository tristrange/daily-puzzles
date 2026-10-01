import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  STATS_STORAGE_KEY,
  addSolve,
  clearStats,
  bestStreak,
  currentStreak,
  mostRecentSolves,
  parseStats,
  readStoredStats,
  storeSolve,
  summarise,
  type SolveRecord,
} from './stats'

function record(over: Partial<SolveRecord> & { id: string }): SolveRecord {
  return {
    puzzleType: 'queens',
    size: 8,
    elapsedMs: 300_000,
    hints: 0,
    solvedAt: 1_789_000_000_000,
    ...over,
  }
}

const stored = (...records: SolveRecord[]) => JSON.stringify(records)

describe('STATS_STORAGE_KEY', () => {
  it('is namespaced and separate from the theme', () => {
    expect(STATS_STORAGE_KEY).toBe('daily-puzzles:stats')
    expect(STATS_STORAGE_KEY).not.toBe('daily-puzzles:theme')
  })
})

describe('parseStats', () => {
  it('reads records back oldest day first', () => {
    const parsed = parseStats(stored(record({ id: '2026-09-28' }), record({ id: '2026-09-26' })))
    expect(parsed.map((held) => held.id)).toEqual(['2026-09-26', '2026-09-28'])
  })

  it('is empty for absent, empty and unparseable storage', () => {
    expect(parseStats(null)).toEqual([])
    expect(parseStats(undefined)).toEqual([])
    expect(parseStats('')).toEqual([])
    expect(parseStats('{not json')).toEqual([])
    expect(parseStats('"a string"')).toEqual([])
    expect(parseStats('null')).toEqual([])
  })

  it('drops entries that are not records and keeps the rest', () => {
    const parsed = parseStats(
      stored(
        record({ id: '2026-09-26' }),
        { id: 'yesterday' } as unknown as SolveRecord,
        { ...record({ id: '2026-09-27' }), elapsedMs: 'quickly' } as unknown as SolveRecord,
        // A record from a future version that gained a field it no longer agrees with.
        { ...record({ id: '2026-09-28' }), puzzleType: 'sudoku' } as unknown as SolveRecord,
        null as unknown as SolveRecord,
      ),
    )
    expect(parsed.map((held) => held.id)).toEqual(['2026-09-26'])
  })

  it('drops a record missing a field rather than reading it as undefined', () => {
    const { hints: _hints, ...withoutHints } = record({ id: '2026-09-26' })
    expect(parseStats(stored(withoutHints as SolveRecord))).toEqual([])
  })

  it('accepts a zero-length solve and a small board', () => {
    // A bound stricter than "is it a number" would quietly drop real records.
    const parsed = parseStats(stored(record({ id: '2026-09-26', elapsedMs: 0, size: 3 })))
    expect(parsed).toHaveLength(1)
    expect(parsed[0]?.elapsedMs).toBe(0)
  })

  it('keeps the earliest solve when a day appears twice', () => {
    const parsed = parseStats(
      stored(
        // A later, faster-looking attempt at the same day.
        record({ id: '2026-09-26', elapsedMs: 100_000, solvedAt: 200 }),
        record({ id: '2026-09-26', elapsedMs: 900_000, solvedAt: 100 }),
      ),
    )
    expect(parsed).toHaveLength(1)
    expect(parsed[0]?.solvedAt).toBe(100)
    expect(parsed[0]?.elapsedMs).toBe(900_000)
  })
})

describe('addSolve', () => {
  it('adds a solve and keeps the list sorted', () => {
    const added = addSolve([record({ id: '2026-09-28' })], record({ id: '2026-09-26' }))
    expect(added.map((held) => held.id)).toEqual(['2026-09-26', '2026-09-28'])
  })

  it('keeps the first solve of a day and ignores a replay', () => {
    const first = record({ id: '2026-09-26', elapsedMs: 600_000, solvedAt: 100 })
    const replay = record({ id: '2026-09-26', elapsedMs: 60_000, solvedAt: 900 })
    const added = addSolve([first], replay)
    expect(added).toEqual([first])
  })
})

describe('currentStreak', () => {
  it('counts consecutive days ending today', () => {
    const records = [
      record({ id: '2026-09-30' }),
      record({ id: '2026-09-29' }),
      record({ id: '2026-09-28' }),
    ]
    expect(currentStreak(records, '2026-09-30')).toBe(3)
  })

  it('survives a today that has not been played yet', () => {
    // Otherwise the streak reads zero every morning, which makes it useless.
    const records = [record({ id: '2026-09-29' }), record({ id: '2026-09-28' })]
    expect(currentStreak(records, '2026-09-30')).toBe(2)
  })

  it('stops at a missed day', () => {
    const records = [record({ id: '2026-09-30' }), record({ id: '2026-09-28' })]
    expect(currentStreak(records, '2026-09-30')).toBe(1)
  })

  it('is zero once two days have been missed', () => {
    const records = [record({ id: '2026-09-28' }), record({ id: '2026-09-27' })]
    expect(currentStreak(records, '2026-09-30')).toBe(0)
  })

  it('is zero with no history', () => {
    expect(currentStreak([], '2026-09-30')).toBe(0)
  })

  it('crosses a month boundary', () => {
    const records = [
      record({ id: '2026-10-02' }),
      record({ id: '2026-10-01' }),
      record({ id: '2026-09-30' }),
    ]
    expect(currentStreak(records, '2026-10-02')).toBe(3)
  })

  it('does not count a future day as part of today', () => {
    const records = [record({ id: '2026-10-05' }), record({ id: '2026-09-30' })]
    expect(currentStreak(records, '2026-09-30')).toBe(1)
  })
})

describe('bestStreak', () => {
  it('finds the longest historical run', () => {
    const records = [
      record({ id: '2026-09-30' }),
      record({ id: '2026-09-24' }),
      record({ id: '2026-09-23' }),
      record({ id: '2026-09-22' }),
    ]
    expect(bestStreak(records)).toBe(3)
  })

  it('is zero with no history', () => {
    expect(bestStreak([])).toBe(0)
  })
})

describe('mostRecentSolves', () => {
  it('orders by when the solve happened, not by which day it is', () => {
    // Ten newer days on record, then a return to an older puzzle completed
    // today. Ordered by puzzle id it would fall off the end of the list.
    const records = [
      ...['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24',
        '2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29',
      ].map((id, index) => record({ id, solvedAt: index })),
      record({ id: '2026-09-05', solvedAt: 100 }),
    ]
    const recent = mostRecentSolves(records, 3)
    expect(recent.map((held) => held.id)).toEqual(['2026-09-05', '2026-09-29', '2026-09-28'])
  })

  it('keeps every solve when there are fewer than the limit', () => {
    const records = [record({ id: '2026-09-30', solvedAt: 2 }), record({ id: '2026-09-29', solvedAt: 1 })]
    expect(mostRecentSolves(records, 10)).toHaveLength(2)
  })

  it('is empty for no history and for a zero limit', () => {
    expect(mostRecentSolves([], 10)).toEqual([])
    expect(mostRecentSolves([record({ id: '2026-09-30' })], 0)).toEqual([])
  })

  it('breaks a tie on the same completion time by day, newest first', () => {
    const records = [record({ id: '2026-09-28', solvedAt: 5 }), record({ id: '2026-09-30', solvedAt: 5 })]
    expect(mostRecentSolves(records, 2).map((held) => held.id)).toEqual(['2026-09-30', '2026-09-28'])
  })

  it('does not reorder the records it was given', () => {
    const records = [record({ id: '2026-09-28', solvedAt: 1 }), record({ id: '2026-09-30', solvedAt: 2 })]
    mostRecentSolves(records, 2)
    expect(records.map((held) => held.id)).toEqual(['2026-09-28', '2026-09-30'])
  })
})

describe('summarise', () => {
  it('is all zeroes with no history', () => {
    expect(summarise([], '2026-09-30')).toEqual({
      solved: 0,
      currentStreak: 0,
      bestStreak: 0,
      fastestMs: null,
      averageMs: null,
      hints: 0,
      byType: { queens: 0, 'star-battle': 0 },
    })
  })

  it('adds up times, hints and puzzle types', () => {
    const stats = summarise(
      [
        record({ id: '2026-09-30', elapsedMs: 100_000, hints: 1 }),
        record({ id: '2026-09-29', elapsedMs: 300_000, hints: 2, puzzleType: 'star-battle' }),
        record({ id: '2026-09-28', elapsedMs: 200_000, hints: 0 }),
      ],
      '2026-09-30',
    )
    expect(stats).toEqual({
      solved: 3,
      currentStreak: 3,
      bestStreak: 3,
      fastestMs: 100_000,
      averageMs: 200_000,
      hints: 3,
      byType: { queens: 2, 'star-battle': 1 },
    })
  })

  it('rounds the average to whole seconds rather than showing milliseconds', () => {
    const stats = summarise(
      [record({ id: '2026-09-30', elapsedMs: 100_001 }), record({ id: '2026-09-29', elapsedMs: 100_000 })],
      '2026-09-30',
    )
    expect(stats.averageMs).toBe(100_001)
    expect(Number.isInteger(stats.averageMs)).toBe(true)
  })
})

/**
 * A `localStorage` stand-in, because these are the only functions that touch a
 * player's actual data and they had no coverage at all: the rest of this file
 * tests the arithmetic, which is pure. A Map is enough — the interface used is
 * getItem, setItem and removeItem.
 */
function stubStorage(initial: Record<string, string> = {}): Map<string, string> {
  const map = new Map(Object.entries(initial))
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
  })
  return map
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the stored history', () => {
  const solve = { id: '2026-09-30', puzzleType: 'queens' as const, size: 8, elapsedMs: 60_000, hints: 0, solvedAt: 1 }

  it('records a solve and reads it back', () => {
    const map = stubStorage()
    storeSolve(solve)
    expect(readStoredStats()).toEqual([solve])
    expect(map.get(STATS_STORAGE_KEY)).toBe('[{"id":"2026-09-30","puzzleType":"queens","size":8,"elapsedMs":60000,"hints":0,"solvedAt":1}]')
  })

  it('returns nothing when storage is empty', () => {
    stubStorage()
    expect(readStoredStats()).toEqual([])
  })

  it('survives a value it cannot read, keeping what is still valid', () => {
    stubStorage({ [STATS_STORAGE_KEY]: '{"not":"an array"}' })
    expect(readStoredStats()).toEqual([])
  })

  it('survives storage that throws on access, as private browsing does', () => {
    // Reading throws, not just writing, and this has to be worth having.
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
      removeItem: () => { throw new Error('blocked') },
    })
    expect(readStoredStats()).toEqual([])
    expect(() => storeSolve(solve)).not.toThrow()
    expect(clearStats()).toEqual([])
  })

  it('does not overwrite the first solve of a day when replayed', () => {
    stubStorage()
    storeSolve({ ...solve, elapsedMs: 600_000 })
    storeSolve({ ...solve, elapsedMs: 30_000 })
    const records = readStoredStats()
    expect(records).toHaveLength(1)
    expect(records[0]?.elapsedMs).toBe(600_000)
  })

  it('keeps the history sorted by day however it arrives', () => {
    stubStorage()
    storeSolve({ ...solve, id: '2026-09-28' })
    storeSolve({ ...solve, id: '2026-09-30' })
    storeSolve({ ...solve, id: '2026-09-29' })
    expect(readStoredStats().map((held) => held.id)).toEqual(['2026-09-28', '2026-09-29', '2026-09-30'])
  })
})

describe('clearStats', () => {
  it('removes the key rather than leaving an empty one behind', () => {
    const map = stubStorage()
    storeSolve({ id: '2026-09-30', puzzleType: 'queens', size: 8, elapsedMs: 1_000, hints: 0, solvedAt: 1 })
    expect(map.has(STATS_STORAGE_KEY)).toBe(true)

    expect(clearStats()).toEqual([])
    expect(map.has(STATS_STORAGE_KEY)).toBe(false)
    expect(readStoredStats()).toEqual([])
  })

  it('leaves the theme alone', () => {
    // A player who has cleared their history should not also lose a preference
    // they set once, and it lives under its own key.
    const map = stubStorage({ 'daily-puzzles:theme': 'dark' })
    storeSolve({ id: '2026-09-30', puzzleType: 'queens', size: 8, elapsedMs: 1_000, hints: 0, solvedAt: 1 })

    clearStats()
    expect(map.get('daily-puzzles:theme')).toBe('dark')
  })

  it('is harmless when there is nothing to clear', () => {
    const map = stubStorage()
    expect(clearStats()).toEqual([])
    expect(map.size).toBe(0)
  })
})
