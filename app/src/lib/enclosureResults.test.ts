import { expect, test } from 'vitest'
import { EnclosureGrid, enclosureFingerprint } from '../domain/enclosure'
import { validatedEnclosureBest } from './enclosureResults'
import type { SolveRecord } from './stats'
const grid = new EnclosureGrid(3, [], 4, 4)
const best = { score: 1, walls: [1, 3, 5, 7], board: enclosureFingerprint(grid), achievedAt: 1 }
const record: SolveRecord = { id: '2026-11-11-enclosure', puzzleType: 'enclosure', size: 3, elapsedMs: 1, hints: 0, solvedAt: 1, enclosureBest: best }
test('checks board and recalculates score', () => {
  expect(validatedEnclosureBest(record, grid)).toEqual(best)
  expect(validatedEnclosureBest(record, new EnclosureGrid(3, [0], 4, 4))).toBeNull()
  expect(validatedEnclosureBest({ ...record, enclosureBest: { ...best, score: 2 } }, grid)).toBeNull()
})
