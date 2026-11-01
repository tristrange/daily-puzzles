/** Explain deductions from the player's marks without searching for a solution. */
import { DIRECTIONS, EAST, OPPOSITE, PIECE_COUNT, PIECE_ENDS, SOUTH, type TrackGrid } from './tracks'
import { CROSS, MAYBE, TRACK_CELL_NAME, isTracksSolved, paintBrush, type TracksGame } from './tracksGame'

type Rule = 'edge' | 'row-count' | 'column-count' | 'connection' | 'line-connection' | 'line-capacity' | 'loop'
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

export function findTrackHint(game: TracksGame): TrackHintResult {
  const { grid, pieces } = game
  if (pieces.length !== grid.cellCount || !pieces.every((v) => Number.isInteger(v) && v >= 0 && v <= MAYBE)
    || pieces.some((v, cell) => grid.givens[cell] !== 0 && v !== grid.givens[cell])) return { kind: 'contradiction' }
  if (isTracksSolved(game)) return { kind: 'none' }
  const candidates = pieces.map((v) => v === CROSS ? EMPTY : v === MAYBE ? TRACK : v ? 1 << v : ALL)
  const steps: TrackHintStep[] = [], latest = Array<number>(grid.cellCount).fill(-1)
  let valid = true
  const restrict = (cell: number, allowed: number, rule: Rule, group: readonly number[], premise: string) => {
    if (!valid) return
    const before = candidates[cell]!, after = before & allowed
    if (!after) { valid = false; return }
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
      if (fixed.length > clue || possible.length < clue) return { kind: 'contradiction' }
      if (fixed.length === clue) {
        for (const cell of cells) if (candidates[cell]! & EMPTY) restrict(cell, EMPTY, rule, cells,
          `${name} already has its ${clue} required track ${clue === 1 ? 'cell' : 'cells'}. Every other cell in this line must be empty, including ${trackCellName(grid, cell)}.`)
      } else if (possible.length === clue) {
        for (const cell of possible) restrict(cell, TRACK, rule, cells,
          `${name} needs ${clue} track ${clue === 1 ? 'cell' : 'cells'}, and only ${clue} cells can still contain track. Every one must be used, including ${trackCellName(grid, cell)}.`)
      }
    }
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
        if (a === b) { valid = false; break }
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
    if (steps.length === previous) break
  }
  if (!valid) return { kind: 'contradiction' }
  const index = steps.findIndex((step) => {
    const brush = brushFor(step.after)
    return brush !== null && brush !== pieces[step.cell]
  })
  if (index < 0) return { kind: 'none' }
  const needed = new Set<number>()
  const include = (i: number) => { if (!needed.has(i)) { needed.add(i); steps[i]!.dependencies.forEach(include) } }
  include(index)
  const step = steps[index]!
  return { kind: 'hint', hint: { cell: step.cell, brush: brushFor(step.after)!, source: game,
    steps: [...needed].sort((a, b) => a - b).map((i) => steps[i]!) } }
}

export function applyTrackHint(game: TracksGame, hint: TrackHint): TracksGame {
  if (game !== hint.source || game.grid.givens[hint.cell] !== 0) return game
  return paintBrush(game, hint.cell, hint.brush)
}
