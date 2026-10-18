import { expect, it } from 'vitest'
import raw from '../data/trio-previews.json'
import pilot from '@shared/docs/measurements/trio-pilot.json'
import { createTrioGame, parseTrioBoard, trioConflicts, type TrioBoard, type TrioGame, type TrioValue } from './trio'
import { applyTrioHint, deduceTrio, findTrioHint } from './trioHints'

const empty = (): TrioBoard => ({ id: 'trio-preview-99', givens: Array<TrioValue>(81).fill(0), relations: [] })
const hintFor = (board: TrioBoard, game = createTrioGame(board)) => {
  const result = findTrioHint(board, game)
  if (result.kind !== 'hint') throw Error(`Expected a hint, got ${result.kind}`)
  return result.hint
}

it('rules out a candidate without placing a symbol or changing other notes', () => {
  const board = empty()
  const givens = [...board.givens]
  givens[0] = givens[3] = givens[6] = 1
  const fixed = { ...board, givens }, game = createTrioGame(fixed)
  const hint = hintFor(fixed, game), next = applyTrioHint(fixed, game, hint)
  expect(hint.cell).toBe(1)
  expect(hint.candidates).toBe(6)
  expect(hint.steps[0]?.group).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
  expect(next.cells).toEqual(game.cells)
  expect(next.notes).toEqual([0, 6, ...Array(79).fill(0)])
  expect(game.notes[1]).toBe(0)
  expect(applyTrioHint(fixed, next, hint)).toBe(next)
  expect(hintFor(fixed, next).steps).toHaveLength(1)
})

it('includes earlier eliminations needed to explain an equality deduction', () => {
  const board = empty(), givens = [...board.givens]
  givens[2] = givens[3] = 1
  const linked = { ...board, givens, relations: [{ first: 0, second: 1, kind: 'same' as const }] }
  const game = createTrioGame(linked), notes = [...game.notes]
  notes[1] = notes[4] = 6 // Already recorded the two direct no-three eliminations.
  const hint = hintFor(linked, { ...game, notes })
  expect(hint.cell).toBe(0)
  expect(hint.candidates).toBe(6)
  expect(hint.steps.map((step) => step.rule)).toEqual(['no-three', 'same'])
  expect(hint.steps[0]?.group).toEqual([1, 2, 3])
  expect(hint.steps[1]?.group).toEqual([0, 1])
})

it('uses a different clue to eliminate the fixed neighbour’s symbol', () => {
  const board = empty(), givens = [...board.givens]
  givens[0] = 2
  const linked = { ...board, givens, relations: [{ first: 0, second: 1, kind: 'different' as const }] }
  const hint = hintFor(linked)
  expect(hint.cell).toBe(1)
  expect(hint.candidates).toBe(5)
  expect(hint.steps.map((step) => step.rule)).toEqual(['different'])
})

it('ignores incorrect pencil notes as evidence and detects contradictory entries', () => {
  const board = parseTrioBoard(raw[0]), game = createTrioGame(board)
  const badNotes = { ...game, notes: game.notes.map((_, cell) => game.cells[cell] ? 0 : 1) }
  const hint = hintFor(board, badNotes)
  expect(hint.candidates & (1 << (pilot.samples[0]!.solution[hint.cell]! - 1))).not.toBe(0)
  const cells = [...game.cells]
  cells[0] = 1 // This wrong sun has no immediate count, triple or relation conflict.
  expect(trioConflicts(board, cells).size).toBe(0)
  expect(findTrioHint(board, { cells, notes: game.notes }).kind).toBe('contradiction')
  expect(findTrioHint(empty(), createTrioGame(empty())).kind).toBe('none')
})

it('solves all five pilots through explainable moves without consulting their answers', () => {
  raw.forEach((sample, index) => {
    const board = parseTrioBoard(sample)
    const trace = deduceTrio(board, board.givens)!.steps.map((step) =>
      `${step.rule}: cell ${step.cell} ${step.before.toString(2).padStart(3, '0')}->${step.after.toString(2).padStart(3, '0')}; group ${step.group.join(',')}`)
    expect(trace).toEqual(pilot.samples[index]!.trace)
    let game: TrioGame = createTrioGame(board)
    for (let moves = 0; game.cells.includes(0) && moves < 250; moves++) {
      const hint = hintFor(board, game)
      expect(hint.steps.length).toBeGreaterThan(0)
      game = applyTrioHint(board, game, hint)
    }
    expect(game.cells).toEqual(pilot.samples[index]!.solution)
    expect(findTrioHint(board, game).kind).toBe('none')
  })
})
