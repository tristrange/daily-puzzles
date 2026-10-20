import { expect, it } from 'vitest'
import raw from '../data/tents-previews.json'
import proof from '@shared/docs/measurements/tents-preview.json'
import { createTentsGame, editTent, hasTentsMatching, isTentsSolved, parseTentsBoard, tentsConflicts, type TentsGame } from './tents'
import { findTentsHint } from './tentsHints'

it('rejects malformed preview boards and inconsistent totals', () => {
  const board = raw[0]!
  for (const change of [{ size: 9 }, { id: '2026-10-20-tents' }, { trees: [64] }, { trees: [1, 1] },
    { rowClues: [1] }, { colClues: Array(8).fill(0) }, { rowClues: Array(8).fill(true) }]) {
    expect(() => parseTentsBoard({ ...board, ...change })).toThrow()
  }
})

it('validates 10×10 boundaries and completes a 100-cell placement', () => {
  const raw = { id: 'tents-preview-7', size: 10, trees: [99],
    rowClues: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1], colClues: [0, 0, 0, 0, 0, 0, 0, 0, 1, 0] }
  const board = parseTentsBoard(raw), game = createTentsGame(board)
  expect(game).toHaveLength(100)
  expect(editTent(board, game, 99, 1)).toBe(game)
  expect(isTentsSolved(board, editTent(board, game, 98, 1))).toBe(true)
  for (const change of [{ size: 12 }, { trees: [100] }, { rowClues: Array(8).fill(0) },
    { colClues: [0, 0, 0, 0, 0, 0, 0, 0, 11, 0] }]) {
    expect(() => parseTentsBoard({ ...raw, ...change })).toThrow()
  }
})

it('preserves trees, ignores no-op edits, and checks complete placements independently', () => {
  const board = parseTentsBoard(raw[0])
  const game = createTentsGame(board)
  expect(editTent(board, game, board.trees[0]!, 1)).toBe(game)
  expect(editTent(board, game, -1, 1)).toBe(game)
  expect(editTent(board, game, 0, 0)).toBe(game)
  const solution: TentsGame = game.map((_, cell) => proof.samples[0]!.solution.includes(cell) ? 1 : 0)
  expect(isTentsSolved(board, solution)).toBe(true)
  expect(isTentsSolved(board, solution.map((v, cell) => cell === proof.samples[0]!.solution[0] ? 0 : v))).toBe(false)
  expect(isTentsSolved(board, solution.map((v, cell) => cell === board.trees[0] ? 1 : v))).toBe(false)
  expect(isTentsSolved(board, [...solution, 0])).toBe(false)
  expect(tentsConflicts(board, editTent(board, editTent(board, game, 0, 1), 1, 1)).has(0)).toBe(true)
})

it('accepts alternative pairings but rejects a local-neighbour-only false solution', () => {
  const ring = { id: 'tents-preview-1', size: 8 as const, trees: [1, 8, 10, 17],
    rowClues: [2, 0, 2, 0, 0, 0, 0, 0], colClues: [2, 0, 2, 0, 0, 0, 0, 0] }
  expect(isTentsSolved(ring, createTentsGame(ring).map((_, cell) => [0, 2, 16, 18].includes(cell) ? 1 : 0))).toBe(true)
  const diagonal = { ...ring, trees: [1, 8], rowClues: [1, 1, 0, 0, 0, 0, 0, 0], colClues: [1, 1, 0, 0, 0, 0, 0, 0] }
  expect(isTentsSolved(diagonal, createTentsGame(diagonal).map((_, cell) => [0, 9].includes(cell) ? 1 : 0))).toBe(false)
  const hall = { ...ring, trees: [1, 26, 35], rowClues: [2, 0, 0, 1, 0, 0, 0, 0], colClues: [1, 0, 1, 1, 0, 0, 0, 0] }
  // The first two tents only share tree 1; the third borders both other trees.
  expect(hasTentsMatching(hall, [0, 2, 27])).toBe(false)
  expect(isTentsSolved(hall, createTentsGame(hall).map((_, cell) => [0, 2, 27].includes(cell) ? 1 : 0))).toBe(false)
})

it('explains only sound moves across the verified preview boards', () => {
  for (const [index, entry] of raw.entries()) {
    const board = parseTentsBoard(entry), answer = proof.samples[index]!.solution
    expect(proof.samples[index]!.id).toBe(board.id)
    expect(isTentsSolved(board, createTentsGame(board).map((_, cell) => answer.includes(cell) ? 1 : 0))).toBe(true)
    let game = createTentsGame(board), shown = 0
    while (!isTentsSolved(board, game) && shown < board.size ** 2) {
      const result = findTentsHint(board, game)
      expect(result.kind, `${board.id} contradicted its solution after ${shown} moves`).not.toBe('contradiction')
      if (result.kind !== 'hint') break
      const hint = result.hint
      expect(hint.reason.length).toBeGreaterThan(10)
      expect(hint.value === 1).toBe(answer.includes(hint.cell))
      const next = editTent(board, game, hint.cell, hint.value)
      expect(next).not.toBe(game)
      game = next
      shown++
    }
    // Larger playtests deliberately exceed the current basic hint rules.
    expect(isTentsSolved(board, game), board.id).toBe(board.size === 8)
    expect(findTentsHint(board, game).kind).toBe('none')
  }
})

it('distinguishes a contradiction from a hint stall without guessing', () => {
  const board = parseTentsBoard(raw[0]), game = createTentsGame(board)
  expect(findTentsHint(board, game.map(() => 2)).kind).toBe('contradiction')
  const ambiguous = { ...board, trees: [1, 17], rowClues: [1, 0, 1, 0, 0, 0, 0, 0], colClues: [1, 0, 1, 0, 0, 0, 0, 0] }
  const undecided = createTentsGame(ambiguous).map((_, cell) => [0, 2, 16, 18].includes(cell) ? 0 : 2)
  expect(findTentsHint(ambiguous, undecided).kind).toBe('none')
})
