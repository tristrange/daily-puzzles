import { expect, it } from 'vitest'
import raw from '../data/trio-previews.json'
import pilot from '@shared/docs/measurements/trio-pilot.json'
import { createTrioGame, editTrio, isTrioSolved, parseTrioBoard, trioConflicts } from './trio'

it('accepts all five engine-verified solutions using the actual rules', () => {
  raw.forEach((sample, i) => {
    const board = parseTrioBoard(sample)
    expect(board.givens).toEqual(pilot.samples[i]!.givens)
    expect(board.relations).toEqual(pilot.samples[i]!.relations)
    expect(isTrioSolved(board, pilot.samples[i]!.solution)).toBe(true)
    expect(isTrioSolved(board, board.givens)).toBe(false)
  })
})

it('rejects malformed boards, wrapped relations and duplicate clues', () => {
  expect(() => parseTrioBoard({ ...raw[0], givens: [0] })).toThrow()
  expect(() => parseTrioBoard({ ...raw[0], relations: [{ first: 8, second: 9, kind: 'same' }] })).toThrow()
  expect(() => parseTrioBoard({ ...raw[0], relations: [raw[0]!.relations[0], raw[0]!.relations[0]] })).toThrow()
})

it('protects givens and keeps notes separate from placed symbols', () => {
  const board = parseTrioBoard(raw[0])
  const game = createTrioGame(board)
  const fixed = board.givens.findIndex(Boolean)
  const empty = board.givens.indexOf(0)
  expect(editTrio(board, game, fixed, { value: 0 })).toBe(game)
  const noted = editTrio(board, game, empty, { note: 2, enabled: true })
  expect(noted.cells[empty]).toBe(0)
  expect(noted.notes[empty]).toBe(2)
  const placed = editTrio(board, noted, empty, { value: 3 })
  expect(placed.cells[empty]).toBe(3)
  expect(placed.notes[empty]).toBe(0)
  expect(editTrio(board, placed, empty, { note: 1, enabled: true })).toBe(placed)
})

it('checks row/column counts, triples and same/different clues without checking notes', () => {
  const board = parseTrioBoard({ id: 'trio-preview-99', givens: Array(81).fill(0), relations: [] })
  const diagonal = Array.from({ length: 81 }, (_, i) => ((Math.floor(i / 9) - i % 9 + 9) % 3) + 1)
  expect(isTrioSolved(board, diagonal)).toBe(true)
  const unbalanced = [...diagonal]
  unbalanced[0] = 2 // Break counts without creating a triple.
  expect([...trioConflicts(board, unbalanced)]).toContain(0)
  const invalid = [...diagonal]
  invalid[0] = invalid[1] = invalid[2] = 1
  expect([...trioConflicts(board, invalid)]).toEqual(expect.arrayContaining([0, 1, 2]))
  const same = parseTrioBoard({ ...board, relations: [{ first: 0, second: 1, kind: 'same' }] })
  expect(isTrioSolved(same, diagonal)).toBe(false)
  const different = parseTrioBoard({ ...board, relations: [{ first: 0, second: 1, kind: 'different' }] })
  expect(isTrioSolved(different, diagonal)).toBe(true)
})

it('clears only the affected symbol notes when placement fills a row and column quota', () => {
  const board = parseTrioBoard({ id: 'trio-preview-99', givens: Array(81).fill(0), relations: [] })
  const cells = [...board.givens], notes = Array<number>(81).fill(0)
  cells[3] = cells[6] = cells[27] = cells[54] = 1
  for (const cell of [0, 1, 2, 9, 18, 20]) notes[cell] = 7
  const game = { cells, notes }, next = editTrio(board, game, 0, { value: 1 })
  expect(next.notes[0]).toBe(0)
  for (const cell of [1, 2, 9, 18]) expect(next.notes[cell]).toBe(6)
  expect(next.notes[20]).toBe(7)
  expect(game.notes[1]).toBe(7)
  expect(editTrio(board, next, 0, { value: 1 })).toBe(next)
  expect(editTrio(board, next, 0, { value: 0 }).notes[1]).toBe(6)
})

it('removes notes excluded by a new consecutive pair and direct relations', () => {
  const board = parseTrioBoard({ id: 'trio-preview-99', givens: Array(81).fill(0), relations: [
    { first: 2, second: 3, kind: 'same' }, { first: 2, second: 11, kind: 'different' },
  ] })
  const cells = [...board.givens], notes = Array<number>(81).fill(0)
  cells[0] = 2
  notes[1] = notes[3] = notes[11] = notes[20] = 7
  const next = editTrio(board, { cells, notes }, 2, { value: 2 })
  expect(next.notes[1]).toBe(5) // 2 would create three consecutive moons.
  expect(next.notes[3]).toBe(2) // The linked cell must match.
  expect(next.notes[11]).toBe(5) // The linked cell must differ.
  expect(next.notes[20]).toBe(7)
})
