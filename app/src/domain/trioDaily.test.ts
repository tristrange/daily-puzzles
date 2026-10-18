import { expect, it } from 'vitest'
import raw from '../data/trio-previews.json'
import { parsePuzzle, isTrioPuzzle } from './puzzle'
import { parseTrioBoard, TrioGrid } from './trio'
import { puzzleIdsForDay } from './dates'
import { TRIO_START } from './games'

const envelope = { id: '2026-10-18-trio', type: 'trio', seed: 123, generatorVersion: 1,
  board: { size: 9, givens: raw[0]!.givens, relations: raw[0]!.relations } }

it('parses daily geometry while preserving strict preview identities', () => {
  const puzzle = parsePuzzle(envelope)
  expect(isTrioPuzzle(puzzle)).toBe(true)
  expect(puzzle.board).toBeInstanceOf(TrioGrid)
  expect(puzzle.board).toMatchObject({ id: envelope.id, size: 9, width: 9, height: 9, cellCount: 81 })
  expect(puzzle.difficulty).toBeNull()
  expect(() => parseTrioBoard({ ...raw[0], id: envelope.id })).toThrow()
  expect(() => parsePuzzle({ ...envelope, id: 'trio-preview-1' })).toThrow()
  expect(() => parsePuzzle({ ...envelope, id: '2026-02-30-trio' })).toThrow()
  expect(() => parsePuzzle({ ...envelope, generatorVersion: 2 })).toThrow()
  expect(() => parsePuzzle({ ...envelope, difficulty: 1 })).toThrow()
})

it('rejects wrapped, reversed, duplicate and out-of-range relations', () => {
  for (const relations of [
    [{ first: 8, second: 9, kind: 'same' }],
    [{ first: 1, second: 0, kind: 'same' }],
    [raw[0]!.relations[0], raw[0]!.relations[0]],
    [{ first: 80, second: 81, kind: 'different' }],
  ]) expect(() => parsePuzzle({ ...envelope, board: { ...envelope.board, relations } })).toThrow()
})

it('starts daily slots with the published backlog', () => {
  expect(TRIO_START).toBe('2026-09-26')
  expect(puzzleIdsForDay('2026-09-25')).not.toContain('2026-09-25-trio')
  expect(puzzleIdsForDay(TRIO_START)).toContain(`${TRIO_START}-trio`)
})
