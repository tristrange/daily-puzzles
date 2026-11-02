import { expect, it } from 'vitest'
import { TrackGrid } from './tracks'
import { applyBrush, createTracksGame, CROSS, MAYBE, isFault, isTracksSolved, trackConflicts, type TracksGame } from './tracksGame'
import { applyTrackHint, findTrackHint } from './trackHints'
import { trackHintLesson } from './hintLessons'
import october31 from '../../public/puzzles/2026-10-31-tracks-small.json'

const middle = () => new TrackGrid(3, 3, [0, 3, 0], [1, 1, 1], [0, 0, 0, 1, 0, 1, 0, 0, 0])
const bend = () => new TrackGrid(3, 3, [2, 2, 3], [3, 1, 3], [2, 0, 2, 0, 0, 0, 0, 0, 0])
const october31Solution = '0415200052462045362020224160316224150046360200350003500200003116'.split('').map(Number)
const agreesWith = (brush: number, value: number) => brush === CROSS ? value === 0 : brush === MAYBE ? value !== 0 : brush === value
function hintFor(game: TracksGame) {
  const result = findTrackHint(game)
  if (result.kind !== 'hint') throw Error(`Expected a hint, got ${result.kind}`)
  return result.hint
}

it('crosses out a cell in a full row and retains the supporting count', () => {
  const game = createTracksGame(middle()), hint = hintFor(game)
  expect(hint).toMatchObject({ cell: 0, brush: CROSS })
  expect(hint.steps.at(-1)?.rule).toBe('row-count')
  expect(hint.steps.at(-1)?.group).toEqual([0, 1, 2])
  expect(applyTrackHint(game, hint).pieces[0]).toBe(CROSS)
  expect(game.pieces[0]).toBe(0)
})

it('can record definite occupancy without revealing an unforced direction', () => {
  let game = applyBrush(createTracksGame(bend()), 1, CROSS)
  game = applyBrush(game, 6, 3)
  const hint = hintFor(game)
  expect(hint.brush).toBe(MAYBE)
  expect(hint.cell).toBe(7)
  expect(applyTrackHint(game, hint).pieces[7]).toBe(MAYBE)
})

it('resolves a forced shape as one move and refuses a hint from a different state', () => {
  const grid = new TrackGrid(3, 1, [3], [1, 1, 1], [1, 0, 1]), game = createTracksGame(grid)
  const hint = hintFor(game)
  expect(hint).toMatchObject({ cell: 1, brush: 1 })
  const next = applyTrackHint(game, hint)
  expect(isTracksSolved(next)).toBe(true)
  expect(applyTrackHint(next, hint)).toBe(next)
  const edited = applyBrush(game, 1, MAYBE)
  expect(applyTrackHint(edited, hint)).toBe(edited)
})

it('checks the entire deduction pass for contradictions before offering an earlier move', () => {
  const game = applyBrush(createTracksGame(bend()), 3, CROSS)
  expect(trackConflicts(game).filter((c) => isFault(c.rule))).toEqual([])
  expect(findTrackHint(game).kind).toBe('contradiction')
  expect(findTrackHint(applyBrush(createTracksGame(middle()), 0, MAYBE)).kind).toBe('contradiction')
})

it('keeps every occupancy and shape hint consistent with two hand-checked routes', () => {
  for (const [grid, solution] of [
    [middle(), [0, 0, 0, 1, 1, 1, 0, 0, 0]],
    [bend(), [2, 0, 2, 2, 0, 2, 3, 1, 6]],
  ] as const) {
    let game = createTracksGame(grid)
    let connection = false
    for (let move = 0; !isTracksSolved(game) && move < 30; move++) {
      const hint = hintFor(game)
      const value = solution[hint.cell]!
      expect(agreesWith(hint.brush, value)).toBe(true)
      if (hint.steps.some((step) => step.rule === 'connection')) connection = true
      game = applyTrackHint(game, hint)
    }
    expect(isTracksSolved(game)).toBe(true)
    expect(findTrackHint(game).kind).toBe('none')
    expect(connection).toBe(true)
  }
})

it('finds another explained, sound move when the October 31 puzzle needs stronger reasoning', () => {
  const { width, height, rowClues, colClues, givens } = october31.board
  const grid = new TrackGrid(width, height, rowClues, colClues, givens)
  let game = createTracksGame(grid)
  for (const [cell, brush] of [[0, CROSS], [12, MAYBE], [16, MAYBE], [18, MAYBE], [25, MAYBE],
    [31, MAYBE], [38, MAYBE], [43, MAYBE], [52, MAYBE]] as const) game = applyBrush(game, cell, brush)

  const hint = hintFor(game)
  expect(agreesWith(hint.brush, october31Solution[hint.cell]!)).toBe(true)
  expect(hint.steps.at(-1)?.reason).toMatch(/empty.*connect|connect.*empty/i)
  expect(trackHintLesson(hint)?.path).toBe('/learn/train-tracks/tracks-edges-1')
  expect(applyTrackHint(game, hint).pieces[hint.cell]).toBe(hint.brush)
})

it('can explain the October 31 puzzle through to its solution without contradicting it', () => {
  const { width, height, rowClues, colClues, givens } = october31.board
  let game = createTracksGame(new TrackGrid(width, height, rowClues, colClues, givens))
  const explanations: string[] = []
  for (let move = 0; move < 200 && !isTracksSolved(game); move++) {
    const hint = hintFor(game)
    expect(agreesWith(hint.brush, october31Solution[hint.cell]!)).toBe(true)
    explanations.push(hint.steps.at(-1)!.reason)
    game = applyTrackHint(game, hint)
  }
  expect(isTracksSolved(game)).toBe(true)
  expect(explanations.some((reason) => reason.includes('would also be empty'))).toBe(true)
  expect(explanations.some((reason) => reason.includes('exceeding the count'))).toBe(true)
  expect(explanations.some((reason) => reason.includes('close a loop'))).toBe(true)
})

it('avoids a loop without choosing between two valid routes', () => {
  const grid = new TrackGrid(4, 4, [4, 4, 4, 2], [3, 3, 4, 4],
    [3, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
  // Independent path enumeration finds both routes for these clues and marks.
  const routes = [
    [3, 1, 1, 5, 5, 4, 5, 2, 3, 6, 2, 2, 0, 0, 3, 6],
    [3, 5, 4, 5, 5, 3, 6, 2, 3, 1, 5, 2, 0, 0, 3, 6],
  ]
  let game: TracksGame = { grid, pieces: [3, 8, 8, 5, 5, 8, 8, 8, 3, 8, 8, 8, 7, 7, 3, 6] }, count = 0
  const first = hintFor(game)
  expect(first).toMatchObject({ cell: 11, brush: 2 })
  expect(first.steps.at(-1)?.reason).toContain('close a loop')
  expect(trackHintLesson(first)?.path).toBe('/learn/train-tracks/tracks-loop-1')
  while (count < 40) {
    const result = findTrackHint(game)
    if (result.kind === 'none') break
    if (result.kind !== 'hint') throw Error('The two valid routes must not be a contradiction')
    for (const route of routes) expect(agreesWith(result.hint.brush, route[result.hint.cell]!)).toBe(true)
    game = applyTrackHint(game, result.hint)
    count++
  }
  expect(count).toBeGreaterThan(0)
  expect(findTrackHint(game).kind).toBe('none')
  expect(isTracksSolved(game)).toBe(false)
})

it('reports an already closed loop as a contradiction before offering a move', () => {
  const grid = new TrackGrid(5, 5, [2, 3, 3, 3, 2], [2, 3, 3, 3, 2],
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1])
  let game = createTracksGame(grid)
  for (const [cell, brush] of [[6, 4], [7, 5], [11, 3], [12, 6]] as const) game = applyBrush(game, cell, brush)
  expect(trackConflicts(game).filter((conflict) => isFault(conflict.rule))).toEqual([])
  expect(findTrackHint(game).kind).toBe('contradiction')
})
