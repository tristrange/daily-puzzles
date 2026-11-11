import queens from '../../../conformance/schema-cases/queens-minimal.accept.json'
import { describe, expect, it } from 'vitest'
import { isEnclosurePuzzle, parsePuzzle } from './puzzle'
import { puzzleIdFor, puzzleIdsForDay } from './dates'

const raw = { id: '2026-11-11-enclosure', type: 'enclosure', seed: 0, generatorVersion: 1,
  board: { size: 8, water: [], horse: 27, wallBudget: 8, optimalScore: 5 } }

describe('enclosure puzzle contract', () => {
  it('parses the distinct optimization family and canonical id', () => {
    const puzzle = parsePuzzle(raw)
    expect(isEnclosurePuzzle(puzzle)).toBe(true)
    expect(puzzle.board).toMatchObject({ horse: 27, wallBudget: 8, optimalScore: 5 })
    expect(puzzleIdFor('2026-11-11', 'enclosure')).toBe(raw.id)
    expect(puzzleIdsForDay('2026-11-10')).not.toContain('2026-11-10-enclosure')
  })
  it('rejects an enclosure id carrying another family board', () => {
    expect(() => parsePuzzle({ ...queens, id: raw.id })).toThrow(/enclosure/)
  })
  it.each([
    { id: '2026-11-11-trio' }, { generatorVersion: 2 }, { difficulty: 1 },
    { board: { ...raw.board, water: [27] } }, { board: { ...raw.board, water: [2, 1] } },
    { board: { ...raw.board, size: 7 } }, { board: { ...raw.board, wallBudget: 11 } },
    { board: { ...raw.board, optimalScore: 0 } }, { board: { ...raw.board, walls: [] } },
  ])('rejects malformed or mismatched envelopes %j', overrides => {
    expect(() => parsePuzzle({ ...raw, ...overrides })).toThrow()
  })
})
