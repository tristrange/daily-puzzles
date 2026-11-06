/** Explain deductions from the player's marks without searching for a solution. */
import { DIRECTIONS, EAST, OPPOSITE, PIECE_COUNT, PIECE_ENDS, SOUTH, type TrackGrid } from './tracks'
import { CROSS, MAYBE, TRACK_CELL_NAME, isTracksSolved, paintBrush, type TracksGame } from './tracksGame'

type Rule = 'edge' | 'row-count' | 'column-count' | 'connection' | 'line-connection' | 'line-capacity' | 'line-pattern' | 'loop' | 'contradiction'
export interface TrackHintStep {
  cell: number; before: number; after: number; rule: Rule; group: readonly number[]
  reason: string; dependencies: readonly number[]
}
export interface TrackHint { cell: number; brush: number; source: TracksGame; steps: readonly TrackHintStep[] }
export type TrackHintResult = { kind: 'hint'; hint: TrackHint } | { kind: 'contradiction' | 'none' }
const EMPTY = 1, TRACK = (1 << (PIECE_COUNT + 1)) - 2, ALL = EMPTY | TRACK
const ARMS = Array.from({ length: DIRECTIONS }, (_, direction) =>
  PIECE_ENDS.reduce((mask, ends, piece) => ends.includes(direction) ? mask | (1 << piece) : mask, 0))
const directions = ['north', 'east', 'south', 'west'] as const
const single = (mask: number) => mask > 0 && (mask & (mask - 1)) === 0
export function trackCellName(grid: TrackGrid, cell: number): string {
  const { row, col } = grid.coords(cell)
  return `row ${row + 1}, column ${col + 1}`
}
function brushFor(mask: number): number | null {
  if (mask === EMPTY) return CROSS
  if (mask & EMPTY) return null
  return single(mask) ? Math.log2(mask) : MAYBE
}

/** Shapes supported by a line arrangement with the right count and matching neighbours. */
export function supportedLineCandidates(cells: readonly number[], candidates: readonly number[], clue: number, direction: number): number[] {
  const length = cells.length, back = (direction + OPPOSITE) % DIRECTIONS
  const forward = Array.from({ length }, () => Array<number>(clue + 1).fill(0))
  const backward = Array.from({ length }, () => Array<number>(clue + 1).fill(0))
  const build = (table: number[][], reverse: boolean) => {
    for (let position = 0; position < length; position++) {
      const i = reverse ? length - 1 - position : position
      const neighbour = reverse ? i + 1 : i - 1
      for (let piece = 0; piece <= PIECE_COUNT; piece++) {
        const bit = 1 << piece, occupied = Number(piece !== 0)
        if (!(candidates[cells[i]!]! & bit)) continue
        const towards = reverse ? direction : back, away = reverse ? back : direction
        const compatible = ARMS[towards]! & bit ? ARMS[away]! : ALL ^ ARMS[away]!
        for (let count = occupied; count <= clue; count++) {
          if (position === 0 ? count === occupied : (table[neighbour]![count - occupied]! & compatible) !== 0) {
            table[i]![count]! |= bit
          }
        }
      }
    }
  }
  build(forward, false)
  build(backward, true)
  return cells.map((_, i) => {
    let supported = 0
    for (let piece = 0; piece <= PIECE_COUNT; piece++) {
      const bit = 1 << piece, occupied = Number(piece !== 0)
      for (let left = occupied; left <= clue; left++) {
        const right = clue - left + occupied
        if (right <= clue && (forward[i]![left]! & bit) && (backward[i]![right]! & bit)) {
          supported |= bit
          break
        }
      }
    }
    return supported
  })
}

type Analysis = { valid: boolean; candidates: number[]; steps: TrackHintStep[] }

function analyse(game: TracksGame): Analysis {
  const { grid, pieces } = game
  const candidates = pieces.map((v) => v === CROSS ? EMPTY : v === MAYBE ? TRACK : v ? 1 << v : ALL)
  const steps: TrackHintStep[] = [], latest = Array<number>(grid.cellCount).fill(-1)
  let valid = true
  const fail = (cell: number, rule: Rule, group: readonly number[], reason: string) => {
    if (!valid) return
    const dependencies = [...new Set([...group, cell].map(i => latest[i]!).filter(i => i >= 0))]
    steps.push({ cell, before: candidates[cell]!, after: 0, rule, group, dependencies, reason })
    valid = false
  }
  const restrict = (cell: number, allowed: number, rule: Rule, group: readonly number[], premise: string) => {
    if (!valid) return
    const before = candidates[cell]!, after = before & allowed
    if (!after) {
      fail(cell, rule, group, `${premise} This leaves no possible track or empty cell at ${trackCellName(grid, cell)}.`)
      return
    }
    if (after === before) return
    const dependencies = [...new Set([...group, cell].map((i) => latest[i]!).filter((i) => i >= 0))]
    const brush = brushFor(after)
    const conclusion = brush === CROSS ? 'The cell must stay empty.' : brush === MAYBE
      ? 'The cell must contain track; its direction is not yet fixed.' : brush !== null
      ? `Only ${TRACK_CELL_NAME[brush]} fits here.` : ''
    latest[cell] = steps.length
    steps.push({ cell, before, after, rule, group, dependencies,
      reason: `${premise}${conclusion ? ` ${conclusion}` : ''}` })
    candidates[cell] = after
  }
  // Only the two fixed edge ends may leave the board. Other cells cannot add an exit.
  for (let cell = 0; cell < grid.cellCount; cell++) {
    if (grid.givens[cell]) continue
    for (let direction = 0; direction < DIRECTIONS; direction++) {
      if (grid.neighbour(cell, direction) === null) restrict(cell, ALL ^ ARMS[direction]!, 'edge', [cell],
        `The ${directions[direction]} side of ${trackCellName(grid, cell)} is at the edge. Only the two fixed endpoints may leave the board.`)
    }
  }
  const lines = [
    ...grid.rowClues.map((clue, row) => ({ clue, rule: 'row-count' as const, name: `Row ${row + 1}`, direction: EAST,
      cells: Array.from({ length: grid.width }, (_, col) => grid.index(row, col)) })),
    ...grid.colClues.map((clue, col) => ({ clue, rule: 'column-count' as const, name: `Column ${col + 1}`, direction: SOUTH,
      cells: Array.from({ length: grid.height }, (_, row) => grid.index(row, col)) })),
  ]
  while (valid) {
    const previous = steps.length
    for (const { clue, rule, name, cells } of lines) {
      const fixed = cells.filter((cell) => !(candidates[cell]! & EMPTY))
      const possible = cells.filter((cell) => candidates[cell]! & TRACK)
      if (fixed.length > clue || possible.length < clue) {
        const reason = fixed.length > clue
          ? `${name} would need at least ${fixed.length} tracks, but its clue is ${clue}.`
          : `${name} needs ${clue} tracks, but only ${possible.length} cells could hold one.`
        fail(cells[0]!, rule, cells, reason)
        break
      }
      if (fixed.length === clue) {
        for (const cell of cells) if (candidates[cell]! & EMPTY) restrict(cell, EMPTY, rule, cells,
          `${name} already has its ${clue} required track ${clue === 1 ? 'cell' : 'cells'}. Every other cell in this line must be empty, including ${trackCellName(grid, cell)}.`)
      } else if (possible.length === clue) {
        for (const cell of possible) restrict(cell, TRACK, rule, cells,
          `${name} needs ${clue} track ${clue === 1 ? 'cell' : 'cells'}, and only ${clue} cells can still contain track. Every one must be used, including ${trackCellName(grid, cell)}.`)
      }
    }
    if (!valid) break
    for (let cell = 0; cell < grid.cellCount; cell++) {
      for (let direction = 0; direction < DIRECTIONS; direction++) {
        const other = grid.neighbour(cell, direction)
        if (other === null) continue
        const back = (direction + OPPOSITE) % DIRECTIONS
        if (!(candidates[other]! & ARMS[back]!)) restrict(cell, ALL ^ ARMS[direction]!, 'connection', [cell, other],
          `The cell at ${trackCellName(grid, other)} cannot connect ${directions[back]}, so ${trackCellName(grid, cell)} cannot connect ${directions[direction]} towards it.`)
        else if (!(candidates[other]! & (ALL ^ ARMS[back]!))) restrict(cell, ARMS[direction]!, 'connection', [cell, other],
          `The cell at ${trackCellName(grid, other)} must connect ${directions[back]}. The track at ${trackCellName(grid, cell)} must meet it with a ${directions[direction]} connection.`)
      }
    }
    // If a track in one cell must connect to its neighbour, crossing out the
    // neighbour also crosses out that cell. A nearly full line may not have room
    // for both to be empty, even when neither is fixed on its own yet.
    for (const { clue, name, cells, direction } of lines) {
      const empty = cells.filter((cell) => !(candidates[cell]! & TRACK))
      const allowedEmpty = cells.length - clue
      for (let i = 0; empty.length + 2 > allowedEmpty && i < cells.length - 1; i++) {
        const first = cells[i]!, second = cells[i + 1]!
        for (const [target, other, towardTarget] of [[first, second, (direction + OPPOSITE) % DIRECTIONS],
          [second, first, direction]] as const) {
          if (!(candidates[target]! & EMPTY) || !(candidates[target]! & TRACK)
            || !(candidates[other]! & EMPTY) || !(candidates[other]! & TRACK)
            || (candidates[other]! & TRACK & (ALL ^ ARMS[towardTarget]!))) continue
          const count = empty.length + 2
          restrict(target, TRACK, 'line-connection', [target, other, ...empty],
            `${name} allows ${allowedEmpty} empty ${allowedEmpty === 1 ? 'cell' : 'cells'}. If ${trackCellName(grid, target)} were empty, ${trackCellName(grid, other)} would also be empty because a track there must connect to it. That would leave ${count} empty cells in ${name.toLowerCase()}${empty.length ? `, including the ${empty.length} already ruled out` : ''}.`)
        }
      }
      // When a line needs just one more track, a cell cannot be used if every
      // shape it could take also needs another unfilled cell in that line.
      const fixed = cells.filter((cell) => !(candidates[cell]! & EMPTY))
      if (fixed.length + 1 !== clue) continue
      for (const cell of cells) {
        const tracks = candidates[cell]! & TRACK
        if (!(candidates[cell]! & EMPTY) || !tracks) continue
        let requiresAnother = 0
        const neighbours: number[] = []
        for (const side of [direction, (direction + OPPOSITE) % DIRECTIONS]) {
          const other = grid.neighbour(cell, side)
          if (other !== null && (candidates[other]! & EMPTY)) {
            requiresAnother |= ARMS[side]!
            neighbours.push(other)
          }
        }
        if (tracks & (ALL ^ requiresAnother)) continue
        restrict(cell, EMPTY, 'line-capacity', [cell, ...fixed, ...neighbours],
          `${name} already has ${fixed.length} of its ${clue} required tracks, so it needs only one more. Any track at ${trackCellName(grid, cell)} would also need another track in this ${direction === EAST ? 'row' : 'column'} that is not already counted, exceeding the count.`)
      }
    }

    // Build the connections already forced by the current candidate sets.
    // Any additional connection between cells on the same segment would close a
    // loop instead of allowing one route between the two edge ends.
    const parent = Array.from({ length: grid.cellCount }, (_, cell) => cell)
    const neighbours = Array.from({ length: grid.cellCount }, () => [] as number[])
    const root = (cell: number): number => {
      while (parent[cell] !== cell) cell = parent[cell]!
      return cell
    }
    const mustConnect = (cell: number, direction: number) => !(candidates[cell]! & (ALL ^ ARMS[direction]!))
    for (let cell = 0; valid && cell < grid.cellCount; cell++) {
      for (const direction of [EAST, SOUTH]) {
        const other = grid.neighbour(cell, direction), back = (direction + OPPOSITE) % DIRECTIONS
        if (other === null || !mustConnect(cell, direction) || !mustConnect(other, back)) continue
        const a = root(cell), b = root(other)
        if (a === b) {
          const group = parent.map((_, i) => i).filter(i => root(i) === a)
          fail(cell, 'loop', group, 'These forced connections close a loop instead of forming one route between the two ends.')
          break
        }
        parent[a] = b
        neighbours[cell]!.push(other); neighbours[other]!.push(cell)
      }
    }
    if (!valid) break
    const path = (start: number, end: number): number[] => {
      const previous = Array<number>(grid.cellCount).fill(-1), queue = [start]
      previous[start] = start
      for (let i = 0; i < queue.length && previous[end] === -1; i++) {
        const cell = queue[i]!
        for (const other of neighbours[cell]!) if (previous[other] === -1) {
          previous[other] = cell; queue.push(other)
        }
      }
      const result = [end]
      while (result.at(-1) !== start) result.push(previous[result.at(-1)!]!)
      return result
    }
    for (let cell = 0; valid && cell < grid.cellCount; cell++) {
      for (const direction of [EAST, SOUTH]) {
        const other = grid.neighbour(cell, direction), back = (direction + OPPOSITE) % DIRECTIONS
        if (other === null || !(candidates[cell]! & ARMS[direction]!) || !(candidates[other]! & ARMS[back]!)
          || (mustConnect(cell, direction) && mustConnect(other, back)) || root(cell) !== root(other)) continue
        const group = path(cell, other)
        const reason = `The highlighted track already connects ${trackCellName(grid, cell)} and ${trackCellName(grid, other)}. Connecting them directly would close a loop before the route reaches both edge ends, so these two cells cannot connect to each other.`
        restrict(cell, ALL ^ ARMS[direction]!, 'loop', group, reason)
        restrict(other, ALL ^ ARMS[back]!, 'loop', group, reason)
      }
    }
    if (steps.length === previous) {
      // Consider whole-line arrangements only after the simpler rules stall.
      // Dynamic programming keeps this bounded even on a 12-cell line.
      for (const { clue, name, cells, direction } of lines) {
        const supported = supportedLineCandidates(cells, candidates, clue, direction)
        for (const [i, cell] of cells.entries()) restrict(cell, supported[i]!, 'line-pattern', cells,
          `${name} needs ${clue} tracks. Considering every arrangement that meets this count and joins neighbouring tracks, some directions or empty cells cannot fit at ${trackCellName(grid, cell)}.`)
      }
      if (steps.length === previous) break
    }
  }
  return { valid, candidates, steps }
}

function neededSteps(steps: readonly TrackHintStep[], index: number): TrackHintStep[] {
  const needed = new Set<number>()
  const include = (i: number) => { if (!needed.has(i)) { needed.add(i); steps[i]!.dependencies.forEach(include) } }
  include(index)
  return [...needed].sort((a, b) => a - b).map((i) => steps[i]!)
}

function contradictionHint(game: TracksGame, cell: number, before: number, assumption: number, brush: number,
  trial: Analysis, previous: readonly TrackHintStep[] = []): TrackHint {
  const failure = trial.steps.at(-1)!
  const supporting = neededSteps(trial.steps, trial.steps.length - 1)
  const name = trackCellName(game.grid, cell)
  const assumed = assumption === MAYBE ? 'contained a track' : assumption === CROSS ? 'were empty' : `held ${TRACK_CELL_NAME[assumption]}`
  const conclusion = brush === CROSS ? 'must be empty' : brush === MAYBE ? 'must contain a track' : `must hold ${TRACK_CELL_NAME[brush]}`
  const choices = assumption <= PIECE_COUNT ? `Only ${TRACK_CELL_NAME[assumption]} or ${TRACK_CELL_NAME[brush]} can fit here. ` : ''
  const first: TrackHintStep = { cell, before, after: assumption === MAYBE ? TRACK : assumption === CROSS ? EMPTY : 1 << assumption,
    rule: 'contradiction', group: [cell], dependencies: [], reason: `Suppose ${name} ${assumed}.` }
  const last: TrackHintStep = { cell, before, after: brush === CROSS ? EMPTY : brush === MAYBE ? TRACK : 1 << brush,
    rule: 'contradiction', group: failure.group, dependencies: [],
    reason: `${choices}If ${name} ${assumed}, the deductions below would lead to a contradiction: ${failure.reason} So ${name} ${conclusion}.` }
  return { cell, brush, source: game, steps: [...previous, first, ...supporting, last] }
}

export function findTrackHint(game: TracksGame): TrackHintResult {
  const { grid, pieces } = game
  if (pieces.length !== grid.cellCount || !pieces.every((v) => Number.isInteger(v) && v >= 0 && v <= MAYBE)
    || pieces.some((v, cell) => grid.givens[cell] !== 0 && v !== grid.givens[cell])) return { kind: 'contradiction' }
  if (isTracksSolved(game)) return { kind: 'none' }
  const { valid, candidates, steps } = analyse(game)
  if (!valid) return { kind: 'contradiction' }
  const index = steps.findIndex((step) => {
    const brush = brushFor(step.after)
    return brush !== null && brush !== pieces[step.cell]
  })
  if (index >= 0) {
    const step = steps[index]!
    return { kind: 'hint', hint: { cell: step.cell, brush: brushFor(step.after)!, source: game,
      steps: neededSteps(steps, index) } }
  }

  // A short what-if is a deduction: if one possibility violates a rule, the
  // opposite follows. Never commit the assumption or search for a solution.
  for (let cell = 0; cell < grid.cellCount; cell++) {
    if (pieces[cell] !== 0 || grid.givens[cell] || !(candidates[cell]! & EMPTY) || !(candidates[cell]! & TRACK)) continue
    for (const [assumption, brush] of [[MAYBE, CROSS], [CROSS, MAYBE]] as const) {
      const trial = analyse(paintBrush(game, cell, assumption))
      if (trial.valid) continue
      if (!trial.steps.length) continue
      if (!analyse(paintBrush(game, cell, brush)).valid) return { kind: 'contradiction' }
      return { kind: 'hint', hint: contradictionHint(game, cell, candidates[cell]!, assumption, brush, trial) }
    }
  }
  // A definite track can also have two possible shapes. Eliminate either one
  // only when its consequences contradict the clues or path rules.
  for (let cell = 0; cell < grid.cellCount; cell++) {
    if (pieces[cell] !== MAYBE || grid.givens[cell]) continue
    const shapes = Array.from({ length: PIECE_COUNT }, (_, i) => i + 1).filter(piece => candidates[cell]! & (1 << piece))
    if (shapes.length !== 2) continue
    for (const [assumption, brush] of [[shapes[0]!, shapes[1]!], [shapes[1]!, shapes[0]!]] as const) {
      const trial = analyse(paintBrush(game, cell, assumption))
      if (trial.valid || !trial.steps.length) continue
      if (!analyse(paintBrush(game, cell, brush)).valid) return { kind: 'contradiction' }
      const last = steps.findLastIndex(step => step.cell === cell)
      const previous = last < 0 ? [] : neededSteps(steps, last)
      return { kind: 'hint', hint: contradictionHint(game, cell, candidates[cell]!, assumption, brush, trial, previous) }
    }
  }
  return { kind: 'none' }
}

export function applyTrackHint(game: TracksGame, hint: TrackHint): TracksGame {
  if (game !== hint.source || game.grid.givens[hint.cell] !== 0) return game
  return paintBrush(game, hint.cell, hint.brush)
}
