/**
 * The shared `conformance/hint-cases/` suite, asserted from the TypeScript side.
 *
 * Each case records the *first* move the Python deduction engine forces — either
 * on an empty board or from an explicit player state — and the app's own hint
 * engine (`./hints`) must reproduce it exactly. The Python engine runs the
 * identical expectations, so the hint the app gives a player can never contradict
 * the solver that rated the puzzle.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { firstHint } from './hints'
import { parsePuzzle } from './puzzle'

const REPO_ROOT = new URL('../../..', import.meta.url).pathname
const CASES_DIR = join(REPO_ROOT, 'conformance', 'hint-cases')

interface Hint {
  cell: number
  action: 'queen' | 'x'
  rule: string
}

interface Case {
  file: string
  state?: { queens: number[]; marks: number[] }
  hint: Hint
}

const manifest = JSON.parse(readFileSync(join(CASES_DIR, 'manifest.json'), 'utf8')) as {
  cases: Case[]
}

function readCase(file: string): unknown {
  return JSON.parse(readFileSync(join(CASES_DIR, file), 'utf8'))
}

describe('conformance: hint-cases', () => {
  it.each(manifest.cases)('$file — $hint.action $hint.cell ($hint.rule)', (testCase) => {
    const puzzle = parsePuzzle(readCase(testCase.file))
    const queens = new Set(testCase.state?.queens ?? [])
    const marks = new Set(testCase.state?.marks ?? [])
    expect(firstHint(puzzle.board, queens, marks)).toEqual(testCase.hint)
  })
})