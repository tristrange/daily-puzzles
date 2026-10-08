/**
 * The shared `conformance/band-cases/` suite, asserted from the TypeScript side.
 *
 * The Python engine runs the identical expectations, so the engine's `LEVEL_NAMES` — which
 * its CLI prints and `tools/verify` reports a ramp against — and the app's
 * `DIFFICULTY_LABEL`, which the player reads on the chooser card and the archive, cannot
 * drift apart.
 *
 * Both key off the same 1-based integer in the puzzle file, so a rename on one side is
 * invisible on the other: nothing crashes and `verify_replay` still passes, because it
 * compares boards. The only symptom is the engine calling a board Expert while the
 * archive card calls it Hard.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DIFFICULTY_LABEL } from './games'
import { DIFFICULTY_BANDS, parsePuzzle, PuzzleParseError, type DifficultyBand } from './puzzle'

const REPO_ROOT = new URL('../../..', import.meta.url).pathname
const CASES_DIR = join(REPO_ROOT, 'conformance', 'band-cases')

/** A valid queens file carrying `difficulty`, for the schema-bound check. */
function puzzleWithBand(level: number): unknown {
  return {
    id: '2026-10-11',
    type: 'queens',
    seed: 1,
    generatorVersion: 1,
    board: { size: 3, regions: [0, 0, 0, 1, 1, 2, 2, 2, 2] },
    difficulty: level,
  }
}

interface Band {
  level: number
  name: string
}

const manifest = JSON.parse(readFileSync(join(CASES_DIR, 'manifest.json'), 'utf8')) as {
  bands: Band[]
}

describe('conformance: band-cases', () => {
  /**
   * Unlike the other suites, this one has no fixture files — the manifest *is* the
   * suite. So this asserts the stronger fact: nothing else may sit in the directory.
   * A `insane-band.accept.json` dropped alongside would otherwise sit unread and
   * unremarked, looking like coverage that tests nothing.
   */
  it('holds no fixture files, so the manifest is the whole suite', () => {
    const onDisk = readdirSync(CASES_DIR).sort()
    expect(onDisk).toEqual(['manifest.json'])
  })

  it('declares a contiguous 1-based range, since every lookup is `level - 1`', () => {
    expect(manifest.bands.map((band) => band.level)).toEqual(
      Array.from({ length: manifest.bands.length }, (_, index) => index + 1),
    )
  })

  it('agrees with the engine on every band name', () => {
    for (const band of manifest.bands) {
      expect(DIFFICULTY_LABEL[band.level as DifficultyBand]).toBe(band.name)
    }
  })

  it('has a label for every band the app declares, and no others', () => {
    // The `Record` type says a key is missing is a compile error, but a band *added* to
    // the manifest is not, so the count is asserted rather than trusted.
    expect(DIFFICULTY_BANDS).toEqual(manifest.bands.map((band) => band.level as DifficultyBand))
    expect(Object.keys(DIFFICULTY_LABEL)).toHaveLength(manifest.bands.length)
  })

  it('has no duplicate names, which would make the label meaningless', () => {
    const names = manifest.bands.map((band) => band.name)
    expect(new Set(names).size).toBe(names.length)
  })

  /**
   * The fourth copy: the schema's own `difficulty` bounds, asserted here as behaviour.
   *
   * The schema is read by both parsers at runtime and its range is hand-written rather
   * than generated from the manifest, so a band added to the manifest and both registries
   * while the schema stayed at `maximum: 5` would pass every other case in this file and
   * then reject every puzzle using the new band, for a reason unrelated to the puzzle.
   */
  it('parses every band the manifest declares, and refuses one past the end', () => {
    for (const band of manifest.bands) {
      expect(() => parsePuzzle(puzzleWithBand(band.level))).not.toThrow()
    }
    expect(() => parsePuzzle(puzzleWithBand(manifest.bands.length + 1))).toThrow(PuzzleParseError)
  })
})
