/**
 * The shared `conformance/schema-cases/` suite, asserted from the TypeScript side.
 *
 * The Python engine runs the identical expectations, so the two parsers cannot drift.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parsePuzzle, PuzzleParseError } from './puzzle'

const REPO_ROOT = new URL('../../..', import.meta.url).pathname
const CASES_DIR = join(REPO_ROOT, 'conformance', 'schema-cases')

interface Case {
  file: string
  valid: boolean
  reason?: string
}

const manifest = JSON.parse(readFileSync(join(CASES_DIR, 'manifest.json'), 'utf8')) as {
  cases: Case[]
}

function readCase(file: string): unknown {
  return JSON.parse(readFileSync(join(CASES_DIR, file), 'utf8'))
}

describe('conformance: schema-cases', () => {
  it('lists every fixture file in the manifest', () => {
    const onDisk = readdirSync(CASES_DIR)
      .filter((name) => name.endsWith('.json') && name !== 'manifest.json')
      .sort()
    expect(manifest.cases.map((testCase) => testCase.file).sort()).toEqual(onDisk)
  })

  it.each(manifest.cases)('case $file', (testCase) => {
    const data = readCase(testCase.file)
    if (testCase.valid) {
      expect(parsePuzzle(data).id).toBe((data as { id: string }).id)
    } else {
      expect(() => parsePuzzle(data)).toThrow(PuzzleParseError)
    }
  })

  it('gives every reject case a reason', () => {
    for (const testCase of manifest.cases) {
      if (!testCase.valid) {
        expect(testCase.reason, `${testCase.file} is a reject case with no reason`).toBeTruthy()
      }
    }
  })
})
