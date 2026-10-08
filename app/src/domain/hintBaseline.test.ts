/**
 * The app's hints must agree with the engine's, on every reachable position.
 *
 * `conformance/hint-cases/` pins a dozen positions exactly. That caught nothing
 * when the intersection rule was ported unsound in #52: every fixture was a
 * single-star board, so a rule that is wrong for every multi-star board passed
 * all of them, and it shipped telling players to mark solution cells dead. A
 * fixture list only covers the states someone thought to write down.
 *
 * `engine/tools/hint_baseline.py` generates the corpus instead — every prefix of
 * every committed puzzle's solution, with the marks the engine can itself
 * justify — and this asserts the app produces the same move the engine recorded.
 * 428 positions, of which a curated dozen were previously the whole of it.
 *
 * A curated case still earns its place, for the states deduction reaches that no
 * prefix does. This is the sweep; that is the example.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { firstHint } from './hints'
import { parsePuzzle } from './puzzle'

const REPO_ROOT = new URL('../../..', import.meta.url).pathname
const ARCHIVE = join(REPO_ROOT, 'app', 'public', 'puzzles')
const BASELINE = join(REPO_ROOT, 'engine', 'tests', 'fixtures', 'hint-baseline.json')

/** `[queens, marks, [cell, action, rule] | null]`, as the engine recorded it. */
type Row = [number[], number[], [number, string, string] | null]

const baseline = JSON.parse(readFileSync(BASELINE, 'utf8')) as Record<string, Row[]>

describe('hint baseline', () => {
  it('agrees with the engine on every recorded position', () => {
    const disagreements: string[] = []
    let checked = 0

    for (const [stem, rows] of Object.entries(baseline)) {
      const { board } = parsePuzzle(JSON.parse(readFileSync(join(ARCHIVE, `${stem}.json`), 'utf8')))
      for (const [queens, marks, expected] of rows) {
        const hint = firstHint(board, new Set(queens), new Set(marks))
        const found = hint === null ? null : [hint.cell, hint.action, hint.rule]
        checked += 1
        if (JSON.stringify(found) !== JSON.stringify(expected)) {
          disagreements.push(
            `${stem} +${queens.length} -${marks.length}: app ${JSON.stringify(found)}, engine ${JSON.stringify(expected)}`,
          )
        }
      }
    }

    expect(disagreements).toEqual([])
    expect(checked).toBeGreaterThan(400)
  })

  it('pins every committed puzzle, so a newly published one cannot slip past', () => {
    // The engine asserts the same from its side. Here it matters as a second
    // reader of the file: a puzzle published without re-running `--write` would
    // be absent from the baseline, and this sweep would quietly test one puzzle
    // fewer without anyone being told.
    const onDisk = readdirSync(ARCHIVE)
      .filter((name) => name.endsWith('.json'))
      .map((name) => name.replace(/\.json$/, ''))
    expect(Object.keys(baseline).sort()).toEqual(onDisk.sort())
  })
})
