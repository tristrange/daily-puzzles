import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { WordGrid } from './wordPaths'
import { parsePuzzle } from './puzzle'
import { createWordGame, submitWord } from './wordGame'
import { findWordHint } from './wordHints'

const grid = new WordGrid(4, 2, ['C', 'A', 'T', null, 'L', 'I', 'O', 'N'], [3, 4], 2)

it('finds a word that leaves a complete cover, ignoring an unfinished trace', () => {
  const game = { ...createWordGame(grid), trace: [4, 5] }
  expect(findWordHint(game)).toEqual({ kind: 'hint', path: [0, 1, 2] })
  expect(game.trace).toEqual([4, 5])
  const accepted = submitWord({ ...game, trace: [0, 1, 2] }).game
  expect(findWordHint(accepted)).toEqual({ kind: 'hint', path: [4, 5, 6, 7] })
  const solved = submitWord({ ...accepted, trace: [4, 5, 6, 7] }).game
  expect(findWordHint(solved)).toEqual({ kind: 'none' })
})

it('recognizes an accepted word that strands the remaining letters', () => {
  // AIL is legal, but leaves C, T, O, N; no adjoining four-letter word covers them.
  const result = submitWord({ ...createWordGame(grid), trace: [1, 5, 4] })
  expect(result.accepted).toBe(true)
  expect(findWordHint(result.game)).toEqual({ kind: 'dead-end' })
})

it('uses the board vocabulary version rather than the familiar answer pool', () => {
  const letters = ['C', 'A', 'M', 'E']
  expect(findWordHint(createWordGame(new WordGrid(4, 1, letters, [4])))).toEqual({ kind: 'dead-end' })
  expect(findWordHint(createWordGame(new WordGrid(4, 1, letters, [4], 2)))).toEqual({ kind: 'hint', path: [0, 1, 2, 3] })
})

it('uses the version 3 vocabulary for seven-letter boards', () => {
  const grid = new WordGrid(7, 1, ['P', 'I', 'C', 'T', 'U', 'R', 'E'], [7], 3)
  expect(findWordHint(createWordGame(grid))).toEqual({ kind: 'hint', path: [0, 1, 2, 3, 4, 5, 6] })
})

it('finds a hint on a six by six version 3 preview within the default budget', () => {
  const casesDir = join(new URL('../../..', import.meta.url).pathname, 'conformance/word-paths/v3')
  const puzzle = parsePuzzle(JSON.parse(readFileSync(join(casesDir, '2026-10-14-words.json'), 'utf8')))
  if (!(puzzle.board instanceof WordGrid)) throw new Error('word grid')
  const result = findWordHint(createWordGame(puzzle.board))
  expect(result.kind).toBe('hint')
  if (result.kind === 'hint') expect(puzzle.board.wordLengths).toContain(result.path.length)
})

it('does not confuse cells beyond index 31 on a blocked seven-row board', () => {
  const letters: (string | null)[] = Array(49).fill(null)
  for (const [cell, letter] of [[35, 'L'], [36, 'I'], [37, 'O'], [38, 'N'], [42, 'C'], [43, 'A'], [44, 'T']] as const) letters[cell] = letter
  expect(findWordHint(createWordGame(new WordGrid(7, 7, letters, [3, 4], 2))))
    .toEqual({ kind: 'hint', path: [42, 43, 44] })
})

it('reports an exhausted search without calling the position a dead end', () => {
  expect(findWordHint(createWordGame(grid), 0)).toEqual({ kind: 'limit' })
})
