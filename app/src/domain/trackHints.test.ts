import { expect, it } from 'vitest'
import { EAST, PIECE_ENDS, SOUTH, TrackGrid } from './tracks'
import { applyBrush, createTracksGame, CROSS, MAYBE, isFault, isTracksSolved, trackConflicts, type TracksGame } from './tracksGame'
import { applyTrackHint, findTrackHint, supportedLineCandidates } from './trackHints'
import { trackHintLesson } from './hintLessons'
import october31 from '../../public/puzzles/2026-10-31-tracks-small.json'
import october29Large from '../../public/puzzles/2026-10-29-tracks-large.json'
import november5Small from '../../public/puzzles/2026-11-05-tracks-small.json'
import november5Medium from '../../public/puzzles/2026-11-05-tracks-medium.json'

const middle = () => new TrackGrid(3, 3, [0, 3, 0], [1, 1, 1], [0, 0, 0, 1, 0, 1, 0, 0, 0])
const bend = () => new TrackGrid(3, 3, [2, 2, 3], [3, 1, 3], [2, 0, 2, 0, 0, 0, 0, 0, 0])
const october31Solution = '0415200052462045362020224160316224150046360200350003500200003116'.split('').map(Number)
// Enumerated independently by the Python route solver, which proved each board unique.
const november5Solutions = [
  '0041164550311162350000460350002041600460241503503602416000036000',
  '5450000000362000000000200000000020000000046000000002000000000315000000000200041500031502460000031635',
].map(solution => solution.split('').map(Number))
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

it('solves both November 5 boards with sound, explained deductions', () => {
  for (const [i, puzzle] of [november5Small, november5Medium].entries()) {
    const { width, height, rowClues, colClues, givens } = puzzle.board
    let game = createTracksGame(new TrackGrid(width, height, rowClues, colClues, givens))
    const rules = new Set<string>()
    for (let move = 0; move < width * height * 2 && !isTracksSolved(game); move++) {
      const hint = hintFor(game)
      expect(agreesWith(hint.brush, november5Solutions[i]![hint.cell]!)).toBe(true)
      hint.steps.forEach(step => rules.add(step.rule))
      game = applyTrackHint(game, hint)
    }
    expect(isTracksSolved(game)).toBe(true)
    expect(rules.has('line-pattern')).toBe(true)
    if (i === 0) expect(rules.has('contradiction')).toBe(true)
  }
})

it('retains a correct next hint from varied partial solutions of the November 5 small board', () => {
  const { width, height, rowClues, colClues, givens } = november5Small.board
  const grid = new TrackGrid(width, height, rowClues, colClues, givens)
  const solution = november5Solutions[0]!
  for (let pattern = 0; pattern < 12; pattern++) {
    let game = createTracksGame(grid)
    for (let cell = 0; cell < grid.cellCount; cell++) {
      if (!givens[cell] && (cell * 7 + pattern * 11) % 13 < 3) {
        game = applyBrush(game, cell, solution[cell] ? solution[cell]! : CROSS)
      }
    }
    const hint = hintFor(game)
    expect(agreesWith(hint.brush, solution[hint.cell]!)).toBe(true)
  }
})

it('explains a forced track shape on the October 29 large board', () => {
  const { width, height, rowClues, colClues, givens } = october29Large.board
  const solution = '004150000000002020000000116020000000004520000000002360041500003500024600004641163500003520000200411624150200354162460204463152311646311163111160'.split('').map(Number)
  let game = createTracksGame(new TrackGrid(width, height, rowClues, colClues, givens))
  let shapeProof = false
  for (let move = 0; move < width * height * 2 && !isTracksSolved(game); move++) {
    const hint = hintFor(game)
    expect(agreesWith(hint.brush, solution[hint.cell]!)).toBe(true)
    if (hint.steps.at(-1)?.rule === 'contradiction' && hint.brush <= 6) shapeProof = true
    game = applyTrackHint(game, hint)
  }
  expect(isTracksSolved(game)).toBe(true)
  expect(shapeProof).toBe(true)
})

it('matches independent exhaustive line arrangements for both directions', () => {
  const cells = [0, 1, 2, 3]
  let state = 1234567
  for (const direction of [EAST, SOUTH]) for (let sample = 0; sample < 200; sample++) {
    const candidates = cells.map(() => {
      state = (state * 1664525 + 1013904223) >>> 0
      return (state & 127) || 1
    })
    const clue = sample % 5
    const expected = cells.map(() => 0)
    const visit = (pieces: number[]) => {
      const i = pieces.length
      if (i === cells.length) {
        if (pieces.filter(piece => piece !== 0).length === clue) {
          pieces.forEach((piece, cell) => { expected[cell]! |= 1 << piece })
        }
        return
      }
      for (let piece = 0; piece < PIECE_ENDS.length; piece++) {
        if (!(candidates[i]! & (1 << piece))) continue
        if (i > 0) {
          const connects = PIECE_ENDS[pieces[i - 1]!]!.includes(direction)
          const connectsBack = PIECE_ENDS[piece]!.includes((direction + 2) % 4)
          if (connects !== connectsBack) continue
        }
        visit([...pieces, piece])
      }
    }
    visit([])
    expect(supportedLineCandidates(cells, candidates, clue, direction)).toEqual(expected)
  }
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
