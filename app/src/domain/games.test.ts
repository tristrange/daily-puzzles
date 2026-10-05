import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Board, PUZZLE_TYPES, type PuzzleType } from './board'
import { puzzleIdFor, puzzleTypeOf } from './dates'
import { firstHint } from './hints'
import { parsePuzzle } from './puzzle'
import {
  DEFAULT_PUZZLE_TYPE,
  PUZZLE_PIECE,
  PUZZLE_TYPE_HAS_HINTS,
  PUZZLE_TYPE_LABEL,
  PUZZLE_TYPE_SUFFIX,
  isDefaultPuzzleType,
} from './games'

/** A legal board of any family: one region per row, one piece per row. */
function makeBoard(puzzleType: PuzzleType, size = 4): Board {
  const regions = Array.from({ length: size * size }, (_, cell) => Math.floor(cell / size))
  const capacity = puzzleType === 'queens' ? 1 : 2
  return new Board(size, regions, new Array(size).fill(capacity), puzzleType)
}

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

  /**
   * The board's accessible name is the label lowercased, read straight from
   * `PUZZLE_TYPE_LABEL`. Worth pinning, because a rename that reads correctly in the
   * UI can still change what a screen reader announces and nothing else would say so.
   */
  it('names each puzzle in the board accessible name without a branch', () => {
    expect(PUZZLE_TYPE_LABEL.queens.toLowerCase()).toBe('queens')
    expect(PUZZLE_TYPE_LABEL['star-battle'].toLowerCase()).toBe('star battle')
  })

  /**
   * The table decides both the button's visibility and whether `firstHint` returns
   * null, so the two must not be answered separately — otherwise a family gets a
   * visible button that does nothing, or silently wrong hints.
   *
   * Asserted on a position with a real forced move rather than an empty board, since
   * `null` from `firstHint` means "no forced move right now" for a family that does
   * have an engine, and would make the two cases indistinguishable.
   */
  it('records which families have a hint engine, and the engine agrees with it', () => {
    const hintCase = parsePuzzle(
      JSON.parse(
        readFileSync(
          join(new URL('../../..', import.meta.url).pathname, 'conformance', 'hint-cases', '2026-05-11.puzzle.json'),
          'utf8',
        ),
      ),
    )
    expect(firstHint(hintCase.board)).not.toBeNull()
    expect(PUZZLE_TYPE_HAS_HINTS[hintCase.puzzleType]).toBe(true)

    for (const type of PUZZLE_TYPES) {
      expect(typeof PUZZLE_TYPE_HAS_HINTS[type]).toBe('boolean')
      // A family without hints must never produce one, whatever the position.
      if (!PUZZLE_TYPE_HAS_HINTS[type]) expect(firstHint(makeBoard(type))).toBeNull()
    }
  })
})