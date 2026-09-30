import { describe, expect, it } from 'vitest'
import {
  STATS_STORAGE_KEY,
  addSolve,
  bestStreak,
  currentStreak,
  parseStats,
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
