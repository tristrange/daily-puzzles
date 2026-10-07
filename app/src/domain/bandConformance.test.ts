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

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DIFFICULTY_LABEL } from './games'
import { DIFFICULTY_BANDS, type DifficultyBand } from './puzzle'

const REPO_ROOT = new URL('../../..', import.meta.url).pathname
const CASES_DIR = join(REPO_ROOT, 'conformance', 'band-cases')

interface Band {
  level: number
  name: string
}

const manifest = JSON.parse(readFileSync(join(CASES_DIR, 'manifest.json'), 'utf8')) as {
  bands: Band[]
}

describe('conformance: band-cases', () => {
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
})
