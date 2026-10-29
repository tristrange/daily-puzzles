import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { parsePuzzle } from './puzzle'
import { puzzleIdsForDay, puzzleIdFor } from './dates'
import { PUZZLE_TYPE_PUBLISHED } from './games'
import { WORD_PATHS_V2_VOCABULARY, WORD_PATHS_V3_VOCABULARY } from './wordVocabulary'
import { WordGrid, WORD_PATHS_VOCABULARY } from './wordPaths'

const casesDir = join(new URL('../../..', import.meta.url).pathname, 'conformance/word-paths')
const manifest = JSON.parse(readFileSync(join(casesDir, 'manifest.json'), 'utf8')) as {
  vocabularySha256: string
  v2Samples: string[]
  v3Samples: string[]
  samples: string[]
  rejects: { name: string; envelope?: Record<string, unknown>; board?: Record<string, unknown>; error: string }[]
}
const read = (name: string) => JSON.parse(readFileSync(join(casesDir, name), 'utf8')) as Record<string, unknown> & {
  board: { width: number; height: number; letters: (string | null)[]; wordLengths: number[] }
}

describe('Word Paths file contract', () => {
  it('uses exactly the frozen Python vocabulary', () => {
    expect(WORD_PATHS_VOCABULARY).toHaveLength(748)
    expect(createHash('sha256').update(WORD_PATHS_VOCABULARY.join('\n')).digest('hex')).toBe(manifest.vocabularySha256)
  })

  it('lists every shared sample', () => {
    expect(readdirSync(casesDir).filter((name) => name.endsWith('.json')).sort())
      .toEqual(['manifest.json', 'path-cases.json', ...manifest.samples].sort())
    expect(readdirSync(join(casesDir, 'v2')).sort()).toEqual([...manifest.v2Samples].sort())
    expect(readdirSync(join(casesDir, 'v3')).sort()).toEqual([...manifest.v3Samples].sort())
  })

  it.each(manifest.samples)('parses %s exactly', (file) => {
    const raw = read(file)
    const puzzle = parsePuzzle(raw)
    expect(puzzle.board).toBeInstanceOf(WordGrid)
    if (!(puzzle.board instanceof WordGrid)) throw new Error('expected word grid')
    expect(puzzle.id).toBe(raw['id'])
    expect(puzzle.puzzleType).toBe('word-paths')
    expect(puzzle.seed).toBe(raw['seed'])
    expect(puzzle.generatorVersion).toBe(1)
    expect(puzzle.difficulty).toBeNull()
    expect(puzzle.board.width).toBe(raw.board.width)
    expect(puzzle.board.height).toBe(raw.board.height)
    expect(puzzle.board.letters).toEqual(raw.board.letters)
    expect(puzzle.board.wordLengths).toEqual(raw.board.wordLengths)
  })

  it.each(manifest.rejects)('rejects $name for the shared reason', (entry) => {
    const raw = read(manifest.samples[0]!)
    const mutated = { ...raw, ...entry.envelope, board: { ...raw.board, ...entry.board } }
    expect(() => parsePuzzle(mutated)).toThrow(entry.error)
  })

  it('copies and freezes caller arrays', () => {
    const letters = ['C', 'A', 'T']
    const lengths = [3]
    const grid = new WordGrid(3, 1, letters, lengths)
    letters[0] = 'D'
    lengths[0] = 4
    expect(grid.letters).toEqual(['C', 'A', 'T'])
    expect(grid.wordLengths).toEqual([3])
    expect(Object.isFrozen(grid.letters)).toBe(true)
    expect(Object.isFrozen(grid)).toBe(true)
  })

  it('registers identity without changing pre-launch daily slots', () => {
    expect(puzzleIdFor('2026-10-14', 'word-paths')).toBe('2026-10-14-words')
    expect(PUZZLE_TYPE_PUBLISHED['word-paths']).toBe(true)
    expect(puzzleIdsForDay('2026-10-14')).not.toContain('2026-10-14-words')
  })
})


it('selects the grid vocabulary from the validated generator version', () => {
  const raw = read('2026-10-15-words.json')
  const old = parsePuzzle(raw)
  const expanded = parsePuzzle({ ...raw, generatorVersion:2 })
  const current = parsePuzzle({ ...raw, generatorVersion:3 })
  expect(old.board).toBeInstanceOf(WordGrid)
  expect(expanded.board).toBeInstanceOf(WordGrid)
  expect(current.board).toBeInstanceOf(WordGrid)
  if (!(old.board instanceof WordGrid) || !(expanded.board instanceof WordGrid) || !(current.board instanceof WordGrid)) throw new Error('word grid')
  expect(old.board.vocabularyVersion).toBe(1)
  expect(expanded.board.vocabularyVersion).toBe(2)
  expect(current.board.vocabularyVersion).toBe(3)
  expect(() => parsePuzzle({ ...raw, generatorVersion:4 })).toThrow()
})


it('uses exactly the frozen Python v2 vocabulary', () => {
  expect(WORD_PATHS_V2_VOCABULARY).toHaveLength(16781)
  expect(createHash('sha256').update(WORD_PATHS_V2_VOCABULARY.join('\n')).digest('hex'))
    .toBe('b5ffd19f0acf8e99fe2d2160ec86329e72bf6eeb6fe75f3786f013fc47da689a')
})

it.each(manifest.v2Samples)('parses v2 preview %s with the broad acceptance context', (file) => {
  const raw = JSON.parse(readFileSync(join(casesDir, 'v2', file), 'utf8'))
  const puzzle = parsePuzzle(raw)
  expect(puzzle.generatorVersion).toBe(2)
  expect(puzzle.board).toBeInstanceOf(WordGrid)
  if (!(puzzle.board instanceof WordGrid)) throw new Error('word grid')
  expect(puzzle.board.vocabularyVersion).toBe(2)
  expect(puzzle.board.letters).toEqual(raw.board.letters)
})

it('uses exactly the frozen Python v3 vocabulary', () => {
  expect(WORD_PATHS_V3_VOCABULARY).toHaveLength(28453)
  expect(createHash('sha256').update(WORD_PATHS_V3_VOCABULARY.join('\n')).digest('hex'))
    .toBe('1fbbc6ebccabbf7a17457c6e83fb61b15ec78d49fcc9cf5a9ffec43974ba536c')
})

it.each(manifest.v3Samples)('parses v3 preview %s as a six by six board', (file) => {
  const raw = JSON.parse(readFileSync(join(casesDir, 'v3', file), 'utf8'))
  const puzzle = parsePuzzle(raw)
  expect(puzzle.generatorVersion).toBe(3)
  expect(puzzle.board).toBeInstanceOf(WordGrid)
  if (!(puzzle.board instanceof WordGrid)) throw new Error('word grid')
  expect(puzzle.board.vocabularyVersion).toBe(3)
  expect([puzzle.board.width, puzzle.board.height]).toEqual([6, 6])
  expect(puzzle.board.wordLengths).toEqual([3, 4, 5, 6, 7])
  expect(puzzle.board.letters).toEqual(raw.board.letters)
})
