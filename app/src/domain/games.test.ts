import { describe, expect, it } from 'vitest'
import { PUZZLE_TYPES } from './board'
import { puzzleIdFor, puzzleTypeOf } from './dates'
import {
  DEFAULT_PUZZLE_TYPE,
  PUZZLE_PIECE,
  PUZZLE_TYPE_LABEL,
  PUZZLE_TYPE_SUFFIX,
  isDefaultPuzzleType,
} from './games'

/**
 * The registry is the only place a puzzle family has to be declared, so these are
 * the invariants that make "add it to `PUZZLE_TYPES`" sufficient. Each one is a
 * way the id scheme could break for every family at once, which is why they are
 * asserted over the registry rather than against today's two names.
 */
describe('puzzle type registry', () => {
  it('gives every family a label and its pieces', () => {
    for (const type of PUZZLE_TYPES) {
      expect(PUZZLE_TYPE_LABEL[type]).toBeTruthy()
      expect(PUZZLE_PIECE[type].noun).toBeTruthy()
      expect(PUZZLE_PIECE[type].plural).toBeTruthy()
      expect(PUZZLE_PIECE[type].glyph).toBeTruthy()
    }
  })

  it('gives exactly one family the unsuffixed id', () => {
    const unsuffixed = PUZZLE_TYPES.filter((type) => PUZZLE_TYPE_SUFFIX[type] === '')
    expect(unsuffixed).toEqual([DEFAULT_PUZZLE_TYPE])
    expect(isDefaultPuzzleType(DEFAULT_PUZZLE_TYPE)).toBe(true)
  })

  it('gives every other family a distinct non-empty suffix', () => {
    const suffixes = PUZZLE_TYPES.filter((type) => type !== DEFAULT_PUZZLE_TYPE).map(
      (type) => PUZZLE_TYPE_SUFFIX[type],
    )
    expect(new Set(suffixes).size).toBe(suffixes.length)
    for (const suffix of suffixes) expect(suffix).not.toBe('')
  })

  /**
   * One family's suffix must not extend another's, or parsing could credit the
   * wrong family: a longer suffix ending in a shorter one would shadow it for any
   * id that carries both.
   */
  it('keeps no suffix a suffix of another', () => {
    const companions = PUZZLE_TYPES.filter((type) => type !== DEFAULT_PUZZLE_TYPE)
    for (const type of companions) {
      for (const other of companions) {
        if (type === other) continue
        expect(PUZZLE_TYPE_SUFFIX[other].endsWith(PUZZLE_TYPE_SUFFIX[type])).toBe(false)
      }
    }
  })

  it('gives every family an id that parses back to that family', () => {
    for (const type of PUZZLE_TYPES) {
      const id = puzzleIdFor('2026-09-30', type)
      expect(puzzleTypeOf(id)).toBe(type)
      expect(id.startsWith('2026-09-30')).toBe(true)
    }
  })

  it('probes one id per family, so a published puzzle is never invisible', () => {
    expect(new Set(PUZZLE_TYPES.map((type) => puzzleIdFor('2026-09-30', type))).size).toBe(
      PUZZLE_TYPES.length,
    )
  })
})