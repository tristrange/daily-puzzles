/**
 * The shared `conformance/id-cases/` suite, asserted from the TypeScript side.
 *
 * The Python engine runs the identical expectations, so the publisher's id naming
 * and the app's id routing cannot drift. A spelling the two disagree on is a puzzle
 * that is published, correct, and unfindable.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PUZZLE_TYPES, type PuzzleType } from './board'
import { isPuzzleId, puzzleIdsForDay, puzzleIdFor, puzzleIdParts, puzzleTypeOf } from './dates'
import { PUZZLE_TYPE_SUFFIX } from './games'
import { parsePuzzle } from './puzzle'

const REPO_ROOT = new URL('../../..', import.meta.url).pathname
const CASES_DIR = join(REPO_ROOT, 'conformance', 'id-cases')

interface TypeEntry {
  type: PuzzleType
  suffix: string
}

interface Case {
  id: string
  day: string
  type: PuzzleType
}

const manifest = JSON.parse(readFileSync(join(CASES_DIR, 'manifest.json'), 'utf8')) as {
  dailyCases: { day: string; ids: string[] }[]
  types: TypeEntry[]
  cases: Case[]
  unparsed: string[]
  boardCases: { file: string; overrides?: Record<string, unknown>; valid: boolean }[]
}

describe('conformance: id-cases', () => {
  it.each(manifest.dailyCases)('agrees with daily slots for $day', ({ day, ids }) => {
    expect(puzzleIdsForDay(day)).toEqual(ids)
  })

  it('agrees with the engine on every declared suffix', () => {
    for (const entry of manifest.types) {
      // The whole id, not just its tail: `endsWith` would pass for a suffix that is
      // merely a suffix of the real one, which is the drift this suite exists to catch.
      expect(puzzleIdFor('2026-10-04', entry.type)).toBe(`2026-10-04${entry.type === 'sudoku' ? '-sudoku-easy' : entry.suffix}`)
      expect(PUZZLE_TYPE_SUFFIX[entry.type]).toBe(entry.suffix)
    }
  })

  it('declares a case for every family the app registers', () => {
    expect(new Set(manifest.types.map((entry) => entry.type))).toEqual(new Set(PUZZLE_TYPES))
  })

  it('pins every declared family to a case, not just to its own registry', () => {
    expect(new Set(manifest.cases.map((entry) => entry.type))).toEqual(new Set(PUZZLE_TYPES))
  })

  it('round-trips each generated id through the parser', () => {
    for (const entry of manifest.types) {
      const generated = puzzleIdFor('2026-10-04', entry.type)
      expect(puzzleIdParts(generated)).toEqual({ day: '2026-10-04', type: entry.type })
    }
  })

  it.each(manifest.cases.map((c) => [c.id, c] as const))('splits %s as declared', (_id, case_) => {
    expect(puzzleIdParts(case_.id)).toEqual({ day: case_.day, type: case_.type })
    expect(puzzleTypeOf(case_.id)).toBe(case_.type)
    expect(isPuzzleId(case_.id)).toBe(true)
  })

  it.each(manifest.unparsed.map((value) => [value] as const))('rejects %j', (value) => {
    expect(puzzleIdParts(value)).toBeNull()
    expect(puzzleTypeOf(value)).toBeNull()
    expect(isPuzzleId(value)).toBe(false)
  })

  it.each(manifest.boardCases)('validates sized envelope $file ($valid)', (case_) => {
    const data = {
      ...JSON.parse(readFileSync(join(CASES_DIR, case_.file), 'utf8')),
      ...case_.overrides,
    }
    if (case_.valid) {
      expect(parsePuzzle(data).id).toBe(data.id)
      expect(parsePuzzle(data).board.width).toBe(data.board.width ?? data.board.size)
    } else {
      expect(() => parsePuzzle(data)).toThrow()
    }
  })
})
