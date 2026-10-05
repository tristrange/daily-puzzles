/**
 * Client-side hint engine.
 *
 * A port of the pure-logic half of `engine/src/queens_engine/deduce.py` (M4):
 * the same candidate-state simulation and the same rule order, but it stops at
 * the *first* firing instead of running to a fixpoint. The answer is pinned to
 * the Python engine by `conformance/hint-cases/`, asserted from both languages,
 * so the hint the app gives a player never contradicts the engine that rated
 * the puzzle.
 *
 * Rules, in firing order (matching Python):
 *
 * - `single-region` / `single-row` / `single-column`: a group with one
 *   candidate left must place its queen there.
 * - `intersection`: if a group's candidates all lie in one group of the other
 *   kind, the two share the queen and the other's spare candidates are dead.
 * - `subset`: exactly k groups fit within k homes, so nothing else may use
 *   those homes.
 *
 * A hint is either "place a queen here" or "this cell is dead" (mark it X).
 * `null` means the pure rules found nothing: either the board is complete or
 * no move is forced — the caller distinguishes the two. Player conflicts are
 * handled by `game.ts` *before* the rules run, because a contradictory queen
 * set would poison the simulation.
 */

import type { Board } from './board'
import { PUZZLE_TYPE_HAS_HINTS } from './games'

export const HINT_RULES = [
  'single-region',
  'single-row',
  'single-column',
  'intersection',
  'subset',
] as const

export type HintRule = (typeof HINT_RULES)[number]

export interface Hint {
  /** One cell the player is told about. */
  cell: number
  /** What to do with it: place the queen, or mark it out. */
  action: 'queen' | 'x'
  /** The rule that forces it. */
  rule: HintRule
}

type GroupKind = 'region' | 'row' | 'column'

/** Live candidate state, mirroring `_State` in the Python engine. */
interface CandidateState {
  board: Board
  cand: Uint8Array
  rowHasQueen: Uint8Array
  colHasQueen: Uint8Array
  regionHasQueen: Uint8Array
  freeRows: number[]
  freeCols: number[]
  freeRegions: number[]
  cellsOfRegion: readonly (readonly number[])[]
}

function initialState(board: Board, queens: ReadonlySet<number>, marks: ReadonlySet<number>): CandidateState {
  const state: CandidateState = {
    board,
    cand: new Uint8Array(board.cellCount).fill(1),
    rowHasQueen: new Uint8Array(board.size),
    colHasQueen: new Uint8Array(board.size),
    regionHasQueen: new Uint8Array(board.size),
    freeRows: new Array<number>(board.size).fill(board.size),
    freeCols: new Array<number>(board.size).fill(board.size),
    freeRegions: Array.from({ length: board.size }, (_, region) =>
      board.cellsOfRegion(region).length,
    ),
    cellsOfRegion: Array.from({ length: board.size }, (_, region) => board.cellsOfRegion(region)),
  }
  for (const cell of marks) {
    if (cell >= 0 && cell < board.cellCount) eliminate(state, cell)
  }
  for (const queen of queens) {
    if (queen >= 0 && queen < board.cellCount) placeQueen(state, queen)
  }
  return state
}

function eliminate(state: CandidateState, cell: number): boolean {
  if (!state.cand[cell]) return false
  state.cand[cell] = 0
  const { row, col } = state.board.coords(cell)
  state.freeRows[row]! -= 1
  state.freeCols[col]! -= 1
  state.freeRegions[state.board.regionAt(cell)]! -= 1
  return true
}

function placeQueen(state: CandidateState, cell: number): number[] {
  const { row, col } = state.board.coords(cell)
  const region = state.board.regionAt(cell)
  state.rowHasQueen[row] = 1
  state.colHasQueen[col] = 1
  state.regionHasQueen[region] = 1

  const dead: number[] = []
  for (let c = 0; c < state.board.size; c += 1) {
    for (const victim of [state.board.index(row, c), state.board.index(c, col)]) {
      if (eliminate(state, victim)) dead.push(victim)
    }
  }
  for (const victim of state.cellsOfRegion[region]!) {
    if (eliminate(state, victim)) dead.push(victim)
  }
  for (const victim of touching(state.board, cell)) {
    if (eliminate(state, victim)) dead.push(victim)
  }
  return dead
}

function touching(board: Board, cell: number): number[] {
  const { row, col } = board.coords(cell)
  const found: number[] = []
  for (let dRow = -1; dRow <= 1; dRow += 1) {
    for (let dCol = -1; dCol <= 1; dCol += 1) {
      if (dRow === 0 && dCol === 0) continue
      const nextRow = row + dRow
      const nextCol = col + dCol
      if (nextRow >= 0 && nextRow < board.size && nextCol >= 0 && nextCol < board.size) {
        found.push(board.index(nextRow, nextCol))
      }
    }
  }
  return found
}

function singleCandidate(state: CandidateState, cells: readonly number[]): number | null {
  let found: number | null = null
  for (const cell of cells) {
    if (state.cand[cell]) {
      if (found !== null) return null
      found = cell
    }
  }
  return found
}

function queenHint(cell: number, rule: HintRule): Hint {
  return { cell, action: 'queen', rule }
}

function deadHint(state: CandidateState, rule: HintRule, victims: readonly number[]): Hint | null {
  for (const cell of victims) {
    if (eliminate(state, cell)) {
      return { cell, action: 'x', rule }
    }
  }
  return null
}

/** Single candidates: exactly one cell left in a region, row or column. */
function huntSingles(state: CandidateState): Hint | null {
  const size = state.board.size
  for (let region = 0; region < size; region += 1) {
    if (state.regionHasQueen[region] || state.freeRegions[region] !== 1) continue
    const cell = singleCandidate(state, state.cellsOfRegion[region]!)
    if (cell !== null) {
      placeQueen(state, cell)
      return queenHint(cell, 'single-region')
    }
  }
  for (let row = 0; row < size; row += 1) {
    if (state.rowHasQueen[row] || state.freeRows[row] !== 1) continue
    const cells = Array.from({ length: size }, (_, c) => state.board.index(row, c))
    const cell = singleCandidate(state, cells)
    if (cell !== null) {
      placeQueen(state, cell)
      return queenHint(cell, 'single-row')
    }
  }
  for (let col = 0; col < size; col += 1) {
    if (state.colHasQueen[col] || state.freeCols[col] !== 1) continue
    const cells = Array.from({ length: size }, (_, r) => state.board.index(r, col))
    const cell = singleCandidate(state, cells)
    if (cell !== null) {
      placeQueen(state, cell)
      return queenHint(cell, 'single-column')
    }
  }
  return null
}

/** One group's candidates all in one line, or one line's all in one group. */
function huntIntersections(state: CandidateState): Hint | null {
  const size = state.board.size
  // Region -> one row / one column: claim the line's cells outside the region.
  for (let region = 0; region < size; region += 1) {
    if (state.regionHasQueen[region] || state.freeRegions[region]! < 2) continue
    const rows = new Set<number>()
    const cols = new Set<number>()
    for (const cell of state.cellsOfRegion[region]!) {
      if (state.cand[cell]) {
        const { row, col } = state.board.coords(cell)
        rows.add(row)
        cols.add(col)
      }
    }
    if (rows.size === 1) {
      const row = rows.values().next().value as number
      if (!state.rowHasQueen[row]) {
        const victims = Array.from({ length: size }, (_, c) => state.board.index(row, c)).filter(
          (cell) => state.board.regionAt(cell) !== region,
        )
        const hint = deadHint(state, 'intersection', victims)
        if (hint) return hint
      }
    }
    if (cols.size === 1) {
      const col = cols.values().next().value as number
      if (!state.colHasQueen[col]) {
        const victims = Array.from({ length: size }, (_, r) => state.board.index(r, col)).filter(
          (cell) => state.board.regionAt(cell) !== region,
        )
        const hint = deadHint(state, 'intersection', victims)
        if (hint) return hint
      }
    }
  }
  // Row / column -> one region: kill the region's cells outside the line.
  for (let row = 0; row < size; row += 1) {
    if (state.rowHasQueen[row] || state.freeRows[row]! < 2) continue
    const regions = new Set<number>()
    for (let c = 0; c < size; c += 1) {
      const cell = state.board.index(row, c)
      if (state.cand[cell]) regions.add(state.board.regionAt(cell))
    }
    if (regions.size === 1) {
      const region = regions.values().next().value as number
      if (!state.regionHasQueen[region]) {
        const victims = state.cellsOfRegion[region]!.filter((cell) => state.board.coords(cell).row !== row)
        const hint = deadHint(state, 'intersection', victims)
        if (hint) return hint
      }
    }
  }
  for (let col = 0; col < size; col += 1) {
    if (state.colHasQueen[col] || state.freeCols[col]! < 2) continue
    const regions = new Set<number>()
    for (let r = 0; r < size; r += 1) {
      const cell = state.board.index(r, col)
      if (state.cand[cell]) regions.add(state.board.regionAt(cell))
    }
    if (regions.size === 1) {
      const region = regions.values().next().value as number
      if (!state.regionHasQueen[region]) {
        const victims = state.cellsOfRegion[region]!.filter((cell) => state.board.coords(cell).col !== col)
        const hint = deadHint(state, 'intersection', victims)
        if (hint) return hint
      }
    }
  }
  return null
}

function* combinations<T>(values: readonly T[], k: number): Generator<T[]> {
  const result = new Array<T>(k)
  function* visit(start: number, depth: number): Generator<T[]> {
    if (depth === k) {
      yield [...result]
      return
    }
    for (let index = start; index < values.length; index += 1) {
      const value = values[index]
      if (value === undefined) continue
      result[depth] = value
      yield* visit(index + 1, depth + 1)
    }
  }
  yield* visit(0, 0)
}

/** Pigeonhole across every pair of group kinds, all six directions. */
function huntSubsets(state: CandidateState): Hint | null {
  const size = state.board.size
  const pairs: Array<[GroupKind, GroupKind]> = [
    ['region', 'row'],
    ['region', 'column'],
    ['row', 'column'],
    ['column', 'row'],
    ['row', 'region'],
    ['column', 'region'],
  ]
  const sourceIndex = (cell: number, kind: GroupKind): number => {
    if (kind === 'region') return state.board.regionAt(cell)
    const { row, col } = state.board.coords(cell)
    return kind === 'row' ? row : col
  }
  const groupHasQueen = (group: number, kind: GroupKind): boolean => {
    if (kind === 'region') return state.regionHasQueen[group] === 1
    return kind === 'row' ? state.rowHasQueen[group] === 1 : state.colHasQueen[group] === 1
  }
  const groupCells = (group: number, kind: GroupKind): readonly number[] => {
    if (kind === 'region') return state.cellsOfRegion[group]!
    const start = group * size
    return Array.from({ length: size }, (_, i) =>
      kind === 'row' ? start + i : group + i * size,
    )
  }

  for (const [source, home] of pairs) {
    const unplaced: number[] = []
    for (let group = 0; group < size; group += 1) {
      if (!groupHasQueen(group, source)) unplaced.push(group)
    }
    if (unplaced.length < 2) continue

    for (let k = 2; k <= unplaced.length; k += 1) {
      for (const combo of combinations(unplaced, k)) {
        const comboSet = new Set(combo)
        const homes = new Set<number>()
        for (const group of combo) {
          for (const cell of groupCells(group, source)) {
            if (state.cand[cell]) homes.add(sourceIndex(cell, home))
          }
        }
        if (homes.size < k) return null
        if (homes.size !== k) continue
        const victims: number[] = []
        for (let cell = 0; cell < state.board.cellCount; cell += 1) {
          if (
            state.cand[cell] &&
            homes.has(sourceIndex(cell, home)) &&
            !comboSet.has(sourceIndex(cell, source))
          ) {
            victims.push(cell)
          }
        }
        const hint = deadHint(state, 'subset', victims)
        if (hint) return hint
      }
    }
  }
  return null
}

/**
 * The first move the rules force, or `null` when nothing is forced (either the
 * board is complete or the rules have stalled). Player-conflict validation is
 * the caller's job.
 *
 * Mark games with the ported rules only: `PUZZLE_TYPE_HAS_HINTS` says which. The
 * port's rules are single-star (a group with one candidate left, regions consumed
 * whole), so a k-star board would get hints that are simply wrong, and a wrong hint
 * is worse than none. Reading the same table the UI hides its button from means the
 * two cannot disagree about which families these are.
 */
export function firstHint(
  board: Board,
  queens: ReadonlySet<number> = new Set(),
  marks: ReadonlySet<number> = new Set(),
): Hint | null {
  if (!PUZZLE_TYPE_HAS_HINTS[board.puzzleType]) return null
  const state = initialState(board, queens, marks)
  const singles = huntSingles(state)
  if (singles) return singles
  const intersections = huntIntersections(state)
  if (intersections) return intersections
  return huntSubsets(state)
}