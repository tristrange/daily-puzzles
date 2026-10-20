import { expect, it } from 'vitest'
import raw from '../data/tents-previews.json'
import { parsePuzzle, isTentsPuzzle } from './puzzle'
import { parseTentsBoard, TentsGrid } from './tents'
import { puzzleIdsForDay } from './dates'
import { TENTS_START } from './games'

const { size, trees, rowClues, colClues } = raw[6]!
const envelope = { id: '2026-10-20-tents', type: 'tents', seed: 123, generatorVersion: 1,
  board: { size, trees, rowClues, colClues } }

it('parses daily geometry and keeps strict preview identities and envelope limits', () => {
  const puzzle = parsePuzzle(envelope)
  expect(isTentsPuzzle(puzzle)).toBe(true)
  expect(puzzle.board).toBeInstanceOf(TentsGrid)
  expect(puzzle.board).toMatchObject({ id: envelope.id, size: 10, width: 10, height: 10, cellCount: 100 })
  expect(puzzle.difficulty).toBeNull()
  expect(() => parseTentsBoard({ ...raw[6], id: envelope.id })).toThrow()
  for (const changes of [{ id: 'tents-preview-7' }, { id: '2026-02-30-tents' },
    { generatorVersion: 2 }, { difficulty: 1 }, { board: { ...envelope.board, size: 8 } },
    { board: { ...envelope.board, trees: trees.slice(1) } },
    { board: { ...envelope.board, trees: [...trees.slice(1), trees[1]] } },
    { board: { ...envelope.board, rowClues: [0, ...rowClues.slice(1)] } },
    { board: { ...envelope.board, colClues: colClues.map(value => value + 1) } },
  ]) expect(() => parsePuzzle({ ...envelope, ...changes })).toThrow()
})

it('starts daily Tents with the published backlog', () => {
  expect(TENTS_START).toBe('2026-09-26')
  expect(puzzleIdsForDay('2026-09-25')).not.toContain('2026-09-25-tents')
  expect(puzzleIdsForDay(TENTS_START)).toContain(`${TENTS_START}-tents`)
})
