import { describe, expect, it } from 'vitest'
import {
  formatPuzzleLabel,
  isPuzzleId,
  parsePuzzleDate,
  previousPuzzleIds,
  puzzleOfToday,
} from './dates'

describe('isPuzzleId', () => {
  it('accepts zero-padded calendar dates', () => {
    expect(isPuzzleId('2026-09-30')).toBe(true)
    expect(isPuzzleId('2000-01-01')).toBe(true)
  })

  it('rejects malformed ids', () => {
    expect(isPuzzleId('2026-9-30')).toBe(false)
    expect(isPuzzleId('2026-13-01')).toBe(false)
    expect(isPuzzleId('2026-02-30')).toBe(false)
    expect(isPuzzleId('abc')).toBe(false)
    expect(isPuzzleId('')).toBe(false)
    expect(isPuzzleId(' 2026-09-30')).toBe(false)
  })
})

describe('puzzleOfToday', () => {
  it('returns the calendar day in the given time zone', () => {
    const instant = new Date('2026-09-30T22:30:00.000Z')
    expect(puzzleOfToday(instant, 'UTC')).toBe('2026-09-30')
    expect(puzzleOfToday(instant, 'America/Los_Angeles')).toBe('2026-09-30')
    expect(puzzleOfToday(instant, 'Asia/Tokyo')).toBe('2026-10-01')
  })

  it('rolls back across a new year boundary', () => {
    const instant = new Date('2026-01-01T00:30:00.000Z')
    expect(puzzleOfToday(instant, 'UTC')).toBe('2026-01-01')
    expect(puzzleOfToday(instant, 'America/New_York')).toBe('2025-12-31')
  })

  it('throws on an unknown time zone rather than guessing', () => {
    expect(() => puzzleOfToday(new Date(), 'Mars/Olympus_Mons')).toThrow(RangeError)
  })
})

describe('parsePuzzleDate', () => {
  it('names the right calendar day regardless of zone', () => {
    const date = parsePuzzleDate('2026-09-30')
    expect(puzzleOfToday(date, 'Asia/Kolkata')).toBe('2026-09-30')
    expect(puzzleOfToday(date, 'Pacific/Honolulu')).toBe('2026-09-30')
  })

  it('rejects ids that are not calendar dates', () => {
    expect(() => parsePuzzleDate('2026-02-30')).toThrow(RangeError)
  })
})

describe('previousPuzzleIds', () => {
  it('walks calendar days backwards, newest first', () => {
    expect(previousPuzzleIds('2026-10-02', 3)).toEqual([
      '2026-10-02',
      '2026-10-01',
      '2026-09-30',
    ])
  })
})

describe('formatPuzzleLabel', () => {
  it('renders a friendly label from a puzzle id', () => {
    expect(formatPuzzleLabel('2026-09-30', 'UTC')).toBe('Wed, Sep 30, 2026')
  })
})