import { expect, it } from 'vitest'
import previewProof from '@shared/docs/measurements/nurikabe-preview.json'
import dailyProof from '@shared/docs/measurements/daily-nurikabe-launch.json'
import type { NurikabeBoard, NurikabeGame } from './nurikabe'
import { solveNurikabe } from './nurikabeSolve'

function oracle(board: NurikabeBoard): NurikabeGame[] {
  const { size, clues } = board, answers: NurikabeGame[] = []
  const adjacent = (a: number, b: number) => Math.abs(Math.floor(a / size) - Math.floor(b / size)) + Math.abs(a % size - b % size) === 1
  for (let bits = 0; bits < 2 ** (size ** 2); bits++) {
    const cells = clues.map((_, i) => bits & (1 << i) ? 2 : 1) satisfies NurikabeGame
    if (clues.some((clue, i) => clue && cells[i] !== 2)) continue
    const pending = new Set(cells.map((_, i) => i)), groups: number[][] = []
    while (pending.size) {
      const start = [...pending][0]!, group = [start]; pending.delete(start)
      for (const cell of group) for (const next of [...pending]) if (cells[cell] === cells[next] && adjacent(cell, next)) {
        group.push(next); pending.delete(next)
      }
      groups.push(group)
    }
    if (groups.filter(group => cells[group[0]!] === 1).length !== 1) continue
    if (groups.filter(group => cells[group[0]!] === 2).some(group => {
      const numbered = group.filter(cell => clues[cell]! > 0)
      return numbered.length !== 1 || clues[numbered[0]!] !== group.length
    })) continue
    let square = false
    for (let row = 0; row < size - 1; row++) for (let col = 0; col < size - 1; col++) {
      if ([row * size + col, row * size + col + 1, (row + 1) * size + col, (row + 1) * size + col + 1].every(cell => cells[cell] === 1)) square = true
    }
    if (!square) answers.push(cells)
  }
  return answers
}

it('matches independent enumeration for 2x2 grids with clues up to three and varied 3x3 boards', () => {
  const boards: NurikabeBoard[] = []
  for (let code = 1; code < 4 ** 4; code++) boards.push({ id: `tiny-${code}`, size: 2,
    clues: Array.from({ length: 4 }, (_, cell) => Math.floor(code / 4 ** cell) % 4) })
  for (const clues of [
    [1, 0, 1, 0, 0, 0, 1, 0, 1], [2, 0, 0, 0, 0, 0, 0, 0, 3], [3, 0, 1, 0, 0, 0, 0, 0, 2],
    [0, 3, 0, 0, 0, 0, 1, 0, 1], [0, 0, 0, 0, 4, 0, 0, 0, 0], [1, 1, 0, 0, 0, 0, 0, 0, 0],
  ]) boards.push({ id: 'three', size: 3, clues })
  for (const board of boards) {
    const answers = oracle(board), result = solveNurikabe(board)
    expect(result.kind, JSON.stringify(board.clues)).toBe(answers.length === 0 ? 'none' : answers.length === 1 ? 'unique' : 'multiple')
    if (result.kind === 'unique') expect(result.cells).toEqual(answers[0])
  }
})

it('returns an honest limit at zero work and after finding a first answer', () => {
  const board = { id: 'two-answers', size: 2, clues: [2, 0, 0, 0] }
  expect(solveNurikabe(board, 0)).toEqual({ kind: 'limit', nodes: 0 })
  expect(solveNurikabe(board, 5)).toEqual({ kind: 'limit', nodes: 5 })
  expect(solveNurikabe(board, 6)).toEqual({ kind: 'multiple', nodes: 6 })
  for (const budget of [-1, 0.5, Infinity]) expect(() => solveNurikabe(board, budget)).toThrow('budget')
})

it('independently verifies all current daily and preview answers within the production budget', () => {
  for (const sample of [...dailyProof.samples, ...previewProof.samples]) {
    const result = solveNurikabe({ id: sample.id, size: sample.size, clues: sample.clues })
    expect(result.kind, sample.id).toBe('unique')
    if (result.kind === 'unique') expect(result.cells).toEqual(sample.solution.map(value => value === 0 ? 1 : 2))
  }
})
