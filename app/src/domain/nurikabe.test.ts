import { expect, it } from 'vitest'
import raw from '../data/nurikabe-previews.json'
import proof from '@shared/docs/measurements/nurikabe-preview.json'
import { createNurikabeGame, editNurikabeCell, isNurikabeGame, isNurikabeSolved, nurikabeConflicts, parseNurikabeBoard, parseNurikabeBoards, type NurikabeGame } from './nurikabe'

const boards = parseNurikabeBoards(raw)
it('recognizes the independently certified boards from sea shading alone, with optional land dots', () => {
  for (const board of boards) {
    const sample = proof.samples.find(sample => sample.id === board.id)!
    const shaded: NurikabeGame = sample.solution.map((mark, cell) => mark === 0 ? 1 : board.clues[cell] ? 2 : 0)
    expect(shaded).toContain(0)
    expect(isNurikabeSolved(board, shaded)).toBe(true)
    expect(isNurikabeSolved(board, shaded.map(mark => mark === 0 ? 2 : mark))).toBe(true)
    expect(nurikabeConflicts(board, shaded).size).toBe(0)
    const sea = shaded.indexOf(1)
    expect(isNurikabeSolved(board, editNurikabeCell(board, shaded, sea, 0))).toBe(false)
    expect(isNurikabeSolved(board, createNurikabeGame(board))).toBe(false)
  }
})

it('highlights only confirmed local contradictions, allowing unfinished connectivity and clue-less land notes', () => {
  const board = parseNurikabeBoard({ id: 'nurikabe-preview-1', size: 3, clues: [1, 0, 1, 0, 0, 0, 1, 0, 1] })
  let game = createNurikabeGame(board)
  game = editNurikabeCell(board, game, 1, 1)
  game = editNurikabeCell(board, game, 7, 1)
  game = editNurikabeCell(board, game, 4, 2)
  expect(nurikabeConflicts(board, game).size).toBe(0)
  expect(isNurikabeSolved(board, game)).toBe(false)
  expect([...nurikabeConflicts(board, editNurikabeCell(board, game, 1, 2))].sort()).toEqual([0, 1, 2, 4])
  const square = parseNurikabeBoard({ id: 'nurikabe-preview-2', size: 3, clues: [0, 0, 0, 0, 0, 0, 0, 0, 1] })
  const sea: NurikabeGame = [1, 1, 0, 1, 1, 0, 0, 0, 2]
  expect([...nurikabeConflicts(square, sea)]).toEqual([0, 1, 3, 4])
  expect(isNurikabeSolved(square, sea)).toBe(false)
})

it('rejects an oversized island, disconnected sea, merged clues and unnumbered islands at completion', () => {
  const board = parseNurikabeBoard({ id: 'nurikabe-preview-1', size: 3, clues: [1, 0, 1, 0, 0, 0, 1, 0, 1] })
  const solved: NurikabeGame = [2, 1, 2, 1, 1, 1, 2, 1, 2]
  expect(isNurikabeSolved(board, solved)).toBe(true)
  for (const cell of [1, 3, 4, 5, 7]) expect(isNurikabeSolved(board, editNurikabeCell(board, solved, cell, 0))).toBe(false)
  expect(nurikabeConflicts(board, editNurikabeCell(board, solved, 1, 2))).toEqual(new Set([0, 1, 2]))
})

it('protects clues and validates the preview and save boundaries, including sparse arrays', () => {
  const board = boards[0]!, game = createNurikabeGame(board)
  expect(editNurikabeCell(board, game, 0, 1)).toBe(game)
  expect(editNurikabeCell(board, game, -1, 1)).toBe(game)
  expect(isNurikabeGame(board, Array(board.size ** 2))).toBe(false)
  const sparse = Array<number>(25); sparse[0] = 1
  for (const entry of [{ ...raw[0], answer: [] }, { ...raw[0], clues: sparse }, { ...raw[0], size: 1 }, { ...raw[0], clues: [1] }, { ...raw[0], id: '2026-10-23-nurikabe' }]) {
    expect(() => parseNurikabeBoard(entry)).toThrow()
  }
  expect(() => parseNurikabeBoards([raw[0], raw[0]])).toThrow()
})
