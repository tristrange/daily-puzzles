import { expect, it } from 'vitest'
import { TrackGrid } from './tracks'
import { applyBrush, createTracksGame, CROSS, MAYBE, isFault, isTracksSolved, trackConflicts, type TracksGame } from './tracksGame'
import { applyTrackHint, findTrackHint } from './trackHints'

const middle = () => new TrackGrid(3, 3, [0, 3, 0], [1, 1, 1], [0, 0, 0, 1, 0, 1, 0, 0, 0])
const bend = () => new TrackGrid(3, 3, [2, 2, 3], [3, 1, 3], [2, 0, 2, 0, 0, 0, 0, 0, 0])
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
      expect(hint.brush === CROSS ? value === 0 : hint.brush === MAYBE ? value !== 0 : hint.brush === value).toBe(true)
      if (hint.steps.some((step) => step.rule === 'connection')) connection = true
      game = applyTrackHint(game, hint)
    }
    expect(isTracksSolved(game)).toBe(true)
    expect(findTrackHint(game).kind).toBe('none')
    expect(connection).toBe(true)
  }
})
