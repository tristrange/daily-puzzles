/**
 * The shared `conformance/board-cases/` suite, asserted from the TypeScript side.
 *
 * The Python engine runs the identical expectations, so the two implementations
 * cannot drift on what a board is allowed to be. `schema-cases/` covers reading the
 * same bytes; this covers *reasoning* about the result, which is where each language
 * has its own copy of the rules.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Board, BoardError, PUZZLE_TYPES, type PuzzleType } from './board'

const REPO_ROOT = new URL('../../..', import.meta.url).pathname
const CASES_DIR = join(REPO_ROOT, 'conformance', 'board-cases')

interface Case {
  file: string
  valid: boolean
  note: string
  error?: string
}

const manifest = JSON.parse(readFileSync(join(CASES_DIR, 'manifest.json'), 'utf8')) as {
  cases: Case[]
  access: { name: string; cell: number; error: string; note: string }[]
}

interface RawBoard {
  size: number
  type: PuzzleType
  regions: number[]
  regionCapacity: number[]
}

function loadCase(fixture: Case): RawBoard {
  return JSON.parse(readFileSync(join(CASES_DIR, fixture.file), 'utf8')) as RawBoard
}

function buildBoard(raw: RawBoard): Board {
  return new Board(raw.size, raw.regions, raw.regionCapacity, raw.type)
}

describe('conformance: board-cases', () => {
  it('lists every fixture file in the manifest', () => {
    const onDisk = readdirSync(CASES_DIR)
      .filter((name) => name.endsWith('.json') && name !== 'manifest.json')
      .sort()
    expect(onDisk).toEqual([...manifest.cases.map((c) => c.file)].sort())
  })

  it('only uses families the app knows', () => {
    for (const fixture of manifest.cases) {
      expect(PUZZLE_TYPES).toContain(loadCase(fixture).type)
    }
  })

  it.each(manifest.access.map((c) => [c.name, c] as const))('access: %s', (_name, spec) => {
    // Out-of-range access must fail the same way in both languages.
    const board = new Board(4, [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3], [1, 1, 1, 1], 'queens')
    expect(() => board.regionAt(spec.cell)).toThrow(BoardError)
    expect(() => board.regionAt(spec.cell)).toThrow(spec.error)
  })

  it.each(manifest.cases.map((c) => [c.file, c] as const))('case %s', (_file, case_) => {
    const raw = loadCase(case_)
    if (case_.valid) {
      expect(() => buildBoard(raw)).not.toThrow()
      return
    }
    let message = ''
    try {
      buildBoard(raw)
    } catch (error) {
      expect(error).toBeInstanceOf(BoardError)
      message = (error as BoardError).message
    }
    expect(message).not.toBe('')
    // Which rule fired, not merely that one did. Several rules can apply to the same
    // board — a queens board with a capacity of 0 is both "not 1" and "below one" —
    // and accepting the board for the wrong reason would let a fixture stop testing
    // what it claims to test.
    expect(message).toContain(case_.error)
  })
})