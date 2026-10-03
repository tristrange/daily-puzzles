import { describe, expect, it } from 'vitest'
import { PUZZLE_TYPES } from './board'
import { PUZZLE_TYPE_SUFFIX } from './games'
import {
  companionPuzzleId,
  formatPuzzleLabel,
  isCompanionPuzzleId,
  isPuzzleId,
  parsePuzzleDate,
  previousPuzzleIds,
  puzzleDay,
  puzzleIdFor,
  puzzleIdParts,
  puzzleIdsForDay,
  puzzleOfToday,
  puzzleTypeOf,
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
    expect(isPuzzleId('2026-09-30-star-star')).toBe(false)
    expect(isPuzzleId('2026-09-30-queens')).toBe(false)
  })

  it('accepts the Star Battle suffix, but still checks the date under it', () => {
    expect(isPuzzleId('2026-09-30-star')).toBe(true)
    expect(isPuzzleId('2026-13-01-star')).toBe(false)
    expect(isPuzzleId('2026-02-30-star')).toBe(false)
  })
})

describe('isCompanionPuzzleId', () => {
  it('is true only for an id carrying a registered suffix', () => {
    expect(isCompanionPuzzleId('2026-09-30-star')).toBe(true)
    expect(isCompanionPuzzleId('2026-09-30')).toBe(false)
  })

  it('is decided by the registry rather than by a test for one suffix', () => {
    for (const type of PUZZLE_TYPES) {
      const id = puzzleIdFor('2026-09-30', type)
      expect(isCompanionPuzzleId(id)).toBe(PUZZLE_TYPE_SUFFIX[type] !== '')
    }
  })
})

describe('puzzleTypeOf', () => {
  it('names the family whose slot the id fills', () => {
    expect(puzzleTypeOf('2026-09-30')).toBe('queens')
    expect(puzzleTypeOf('2026-09-30-star')).toBe('star-battle')
  })

  it('is null for an id no family claims', () => {
    expect(puzzleTypeOf('2026-09-30-trains')).toBeNull()
    expect(puzzleTypeOf('nope')).toBeNull()
  })
})

describe('puzzleIdParts', () => {
  it('splits every registered family id into day and type', () => {
    for (const type of PUZZLE_TYPES) {
      expect(puzzleIdParts(puzzleIdFor('2026-09-30', type))).toEqual({ day: '2026-09-30', type })
    }
  })
})

describe('puzzleDay', () => {
  it('is the bare date either id shares', () => {
    expect(puzzleDay('2026-09-30')).toBe('2026-09-30')
    expect(puzzleDay('2026-09-30-star')).toBe('2026-09-30')
  })

  it('refuses something that is not a puzzle id', () => {
    expect(() => puzzleDay('nope')).toThrow(RangeError)
  })
})

describe('companionPuzzleId', () => {
  it('round-trips between the two puzzles of a day', () => {
    expect(companionPuzzleId('2026-09-30')).toBe('2026-09-30-star')
    expect(companionPuzzleId('2026-09-30-star')).toBe('2026-09-30')
  })
})

describe('puzzleIdsForDay', () => {
  it('lists one id per registered family, in registry order', () => {
    expect(puzzleIdsForDay('2026-09-30')).toEqual(['2026-09-30', '2026-09-30-star'])
    expect(puzzleIdsForDay('2026-09-30')).toEqual(
      PUZZLE_TYPES.map((type) => puzzleIdFor('2026-09-30', type)),
    )
  })
})

describe('puzzleIdFor', () => {
  it('builds the id from the day and the family suffix', () => {
    expect(puzzleIdFor('2026-09-30', 'queens')).toBe('2026-09-30')
    expect(puzzleIdFor('2026-09-30', 'star-battle')).toBe('2026-09-30-star')
  })

  it('round-trips through the parser for every registered family', () => {
    for (const type of PUZZLE_TYPES) {
      expect(puzzleTypeOf(puzzleIdFor('2026-09-30', type))).toBe(type)
    }
  })

  it('refuses a day that is not a calendar date', () => {
    expect(() => puzzleIdFor('2026-02-30', 'queens')).toThrow(RangeError)
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
  it('reads the date out of the Star Battle id', () => {
    expect(parsePuzzleDate('2026-09-30-star').getTime()).toBe(
      parsePuzzleDate('2026-09-30').getTime(),
    )
  })

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