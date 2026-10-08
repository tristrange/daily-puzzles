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
 * - `single-region` / `single-row` / `single-column`: a group owing one star
 *   with one cell left must place it there.
 * - `fill`: a group needing exactly as many stars as it has cells left — every
 *   one of those cells is a star. Unreachable at k = 1, where it is already the
 *   single above; this is the rule that makes a many-star board tractable.
 * - `intersection`: if a group's candidates all lie in one group of the other
 *   kind, the two share a star and the other's spare candidates are dead.
 * - `subset`: k groups owing exactly as many stars as their homes have room
 *   for, so nothing else may use those homes.
 *
 * A hint is either "place a queen here" or "this cell is dead" (mark it X).
 * `null` means the pure rules found nothing: either the board is complete or
 * no move is forced — the caller distinguishes the two. Player conflicts are
 * handled by `game.ts` *before* the rules run, because a contradictory queen
 * set would poison the simulation.
 */

import type { Board } from './board'
import { starsPerRow } from './game'
import { PUZZLE_TYPE_HAS_HINTS } from './games'

export const HINT_RULES = [
  'single-region',
  'single-row',
  'single-column',
  'fill',
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

/**
 * Live candidate state, mirroring `_State` in the Python engine.
 *
 * `*Need` counts the stars a group still owes and `free*` the cells it has left
 * to put them in. A group is finished when its need reaches zero, which is the
 * only condition any rule tests — so a one-star group and a two-star group
 * travel through exactly the same code.
 */
interface CandidateState {
  board: Board
  cand: Uint8Array
  rowNeed: number[]
  colNeed: number[]
  regionNeed: number[]
  freeRows: number[]
  freeCols: number[]
  freeRegions: number[]
  cellsOfRegion: readonly (readonly number[])[]
}

function initialState(board: Board, queens: ReadonlySet<number>, marks: ReadonlySet<number>): CandidateState {
  const state: CandidateState = {
    board,
    cand: new Uint8Array(board.cellCount).fill(1),
    rowNeed: new Array<number>(board.size).fill(starsPerRow(board)),
    colNeed: new Array<number>(board.size).fill(starsPerRow(board)),
    regionNeed: [...board.regionCapacity],
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
    if (queen >= 0 && queen < board.cellCount) placeStar(state, queen)
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

/**
 * Place a star at `cell` and kill everything it rules out.
 *
 * A group only empties when its last star lands, so at k > 1 a row, column and
 * region survive their earlier stars — which is the whole difference between a
 * one-star and a many-star board. The cell itself is consumed last: at k = 1 the
 * sweeps already do it, and at k > 1 a cell left as a candidate could be placed
 * a second time.
 */
function placeStar(state: CandidateState, cell: number): number[] {
  const { row, col } = state.board.coords(cell)
  const region = state.board.regionAt(cell)
  state.rowNeed[row]! -= 1
  state.colNeed[col]! -= 1
  state.regionNeed[region]! -= 1

  const dead: number[] = []
  const rowFull = state.rowNeed[row] === 0
  const colFull = state.colNeed[col] === 0
  if (rowFull || colFull) {
    for (let c = 0; c < state.board.size; c += 1) {
      if (rowFull) {
        const inRow = state.board.index(row, c)
        if (eliminate(state, inRow)) dead.push(inRow)
      }
      if (colFull) {
        const inCol = state.board.index(c, col)
        if (eliminate(state, inCol)) dead.push(inCol)
      }
    }
  }
  if (state.regionNeed[region] === 0) {
    for (const victim of state.cellsOfRegion[region]!) {
      if (eliminate(state, victim)) dead.push(victim)
    }
  }
  for (const victim of touching(state.board, cell)) {
    if (eliminate(state, victim)) dead.push(victim)
  }

  if (state.cand[cell]) {
    state.cand[cell] = 0
    state.freeRows[row]! -= 1
    state.freeCols[col]! -= 1
    state.freeRegions[region]! -= 1
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

/**
 * Groups with no slack left, and groups down to their last cell.
 *
 * Two shapes, and the first is a special case of the second at k = 1. The three
 * kinds of group are identical in form, so one loop covers them rather than
 * three copies that could drift apart.
 */
function huntSingles(state: CandidateState): Hint | null {
  const size = state.board.size
  const kinds: Array<[GroupKind, number[], number[], HintRule]> = [
    ['region', state.regionNeed, state.freeRegions, 'single-region'],
    ['row', state.rowNeed, state.freeRows, 'single-row'],
    ['column', state.colNeed, state.freeCols, 'single-column'],
  ]
  for (const [kind, needs, frees, rule] of kinds) {
    for (let group = 0; group < size; group += 1) {
      const need = needs[group]!
      if (need === 0) continue
      if (need === 1 && frees[group] === 1) {
        const cell = singleCandidate(state, groupCells(state, kind, group))
        if (cell !== null) {
          placeStar(state, cell)
          return queenHint(cell, rule)
        }
      } else if (need === frees[group]) {
        for (const cell of groupCells(state, kind, group)) {
          if (state.cand[cell]) {
            placeStar(state, cell)
            return queenHint(cell, 'fill')
          }
        }
      }
    }
  }
  return null
}

/** Every cell belonging to `group` of the given kind, row-major. */
function groupCells(state: CandidateState, kind: GroupKind, group: number): readonly number[] {
  if (kind === 'region') return state.cellsOfRegion[group]!
  const size = state.board.size
  const start = group * size
  return Array.from({ length: size }, (_, i) => (kind === 'row' ? start + i : group + i * size))
}

/**
 * A group that can only reach a set of homes of exactly the right size consumes
 * them; every other cell in those homes is dead.
 *
 * The count has to *balance*: a region needing n stars whose candidates reach
 * rows with room for fewer than n is a contradiction, and one reaching room for
 * more than n has claimed nothing. At k = 1 that collapses to the familiar "the
 * region's queen is in that row, so the rest of the row is dead". Spreading it
 * the other way — "the region has candidates in exactly one row" — is unsound at
 * k > 1, because a region may put both its stars in one row and none in another.
 *
 * Groups with no slack are skipped: `fill` has already dealt with them.
 */
function huntIntersections(state: CandidateState): Hint | null {
  const size = state.board.size
  const needs = (kind: GroupKind): number[] =>
    kind === 'region' ? state.regionNeed : kind === 'row' ? state.rowNeed : state.colNeed
  const frees = (kind: GroupKind): number[] =>
    kind === 'region' ? state.freeRegions : kind === 'row' ? state.freeRows : state.freeCols
  /** How many stars the given homes can still take between them. */
  const room = (kind: GroupKind, homes: Iterable<number>): number => {
    let total = 0
    for (const home of homes) total += needs(kind)[home]!
    return total
  }

  // Region -> the rows and columns it can still reach.
  for (let region = 0; region < size; region += 1) {
    const need = state.regionNeed[region]!
    if (need === 0 || state.freeRegions[region]! <= need) continue
    const rows = new Set<number>()
    const cols = new Set<number>()
    for (const cell of state.cellsOfRegion[region]!) {
      if (state.cand[cell]) {
        const { row, col } = state.board.coords(cell)
        rows.add(row)
        cols.add(col)
      }
    }
    for (const [kind, homes] of [
      ['row', rows],
      ['column', cols],
    ] as const) {
      const capacity = room(kind, homes)
      if (capacity < need) return null
      if (capacity !== need) continue
      const dead = Array.from(homes).flatMap((line) =>
        groupCells(state, kind, line).filter(
          (cell) => state.board.regionAt(cell) !== region,
        ),
      )
      const hint = deadHint(state, 'intersection', dead)
      if (hint) return hint
    }
  }

  // Row / column -> the regions it can still reach.
  for (const kind of ['row', 'column'] as const) {
    const axis = kind === 'row' ? 'row' : 'col'
    for (let line = 0; line < size; line += 1) {
      const need = needs(kind)[line]!
      if (need === 0 || frees(kind)[line]! <= need) continue
      const regions = new Set<number>()
      for (const cell of groupCells(state, kind, line)) {
        if (state.cand[cell]) regions.add(state.board.regionAt(cell))
      }
      const capacity = room('region', regions)
      if (capacity < need) return null
      if (capacity !== need) continue
      const dead = Array.from(regions).flatMap((region) =>
        state.cellsOfRegion[region]!.filter(
          (cell) => state.board.coords(cell)[axis] !== line,
        ),
      )
      const hint = deadHint(state, 'intersection', dead)
      if (hint) return hint
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
  const needsOf = (kind: GroupKind): number[] =>
    kind === 'region' ? state.regionNeed : kind === 'row' ? state.rowNeed : state.colNeed

  for (const [source, home] of pairs) {
    const sourceNeed = needsOf(source)
    const unplaced: number[] = []
    for (let group = 0; group < size; group += 1) {
      if (sourceNeed[group]! > 0) unplaced.push(group)
    }
    if (unplaced.length < 2) continue

    for (let k = 2; k <= unplaced.length; k += 1) {
      for (const combo of combinations(unplaced, k)) {
        const comboSet = new Set(combo)
        const homes = new Set<number>()
        let stars = 0
        for (const group of combo) {
          stars += sourceNeed[group]!
          for (const cell of groupCells(state, source, group)) {
            if (state.cand[cell]) homes.add(sourceIndex(cell, home))
          }
        }
        // Room is what the homes can still *take*, which is each one's remaining
        // need rather than its existence: at k = 1 the two coincide, which is why
        // the original rule could count homes instead.
        let room = 0
        for (const homeGroup of homes) room += needsOf(home)[homeGroup]!
        if (room !== stars) continue
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