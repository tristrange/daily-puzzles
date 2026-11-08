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
import { PUZZLE_PIECE, PUZZLE_TYPE_HAS_HINTS } from './games'

export const HINT_RULES = [
  'single-region',
  'single-row',
  'single-column',
  'fill',
  'intersection',
  'subset',
  'trial',
] as const

export type HintRule = (typeof HINT_RULES)[number]

export interface Hint {
  /** One cell the player is told about. */
  cell: number
  /** What to do with it: place the queen, or mark it out. */
  action: 'queen' | 'x'
  /** The rule that forces it. */
  rule: HintRule
  /** Evidence captured where the rule fires, before changing its candidate state. */
  reason: string
  support: readonly number[]
  sources: readonly Group[]
  homes: readonly Group[]
}

type GroupKind = 'region' | 'row' | 'column'

type Group = readonly [GroupKind, number]

/**
 * Why a candidate state cannot be completed.
 *
 * `sources` are the groups still owing stars and `homes` the groups whose room
 * is too small. Empty `homes` means the sources ran out of cells to put their
 * stars in; otherwise the stars have somewhere to go, but those homes cannot
 * take them all.
 */
interface Contradiction {
  sources: readonly Group[]
  homes: readonly Group[]
  need: number
  room: number
}

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
  queens: Set<number>
  cand: Uint8Array
  rowNeed: number[]
  colNeed: number[]
  regionNeed: number[]
  freeRows: number[]
  freeCols: number[]
  freeRegions: number[]
  cellsOfRegion: readonly (readonly number[])[]
  contradiction: Contradiction | null
}

function initialState(board: Board, queens: ReadonlySet<number>, marks: ReadonlySet<number>): CandidateState {
  const state: CandidateState = {
    board,
    queens: new Set(queens),
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
    contradiction: null,
  }
  for (const cell of marks) {
    if (cell >= 0 && cell < board.cellCount) eliminate(state, cell)
  }
  for (const queen of queens) {
    if (queen >= 0 && queen < board.cellCount) placeStar(state, queen)
  }
  return state
}

function cloneState(state: CandidateState): CandidateState {
  return {
    board: state.board,
    queens: new Set(state.queens),
    cand: new Uint8Array(state.cand),
    rowNeed: [...state.rowNeed],
    colNeed: [...state.colNeed],
    regionNeed: [...state.regionNeed],
    freeRows: [...state.freeRows],
    freeCols: [...state.freeCols],
    freeRegions: [...state.freeRegions],
    cellsOfRegion: state.cellsOfRegion,
    contradiction: state.contradiction,
  }
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
  state.queens.add(cell)
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

export function hintCellName(board: Board, cell: number): string {
  const { row, col } = board.coords(cell)
  return `row ${row + 1}, column ${col + 1}`
}

function groupNeed(state: CandidateState, [kind, index]: Group): number {
  return (kind === 'region' ? state.regionNeed : kind === 'row' ? state.rowNeed : state.colNeed)[index]!
}

function pieceCount(board: Board, n: number): string {
  const piece = PUZZLE_PIECE[board.puzzleType]
  return `${n} ${n === 1 ? piece.noun : piece.plural}`
}

function groupName(state: CandidateState, [kind, index]: Group): string {
  return kind === 'region'
    ? `region containing ${hintCellName(state.board, state.cellsOfRegion[index]![0]!)}`
    : `${kind} ${index + 1}`
}

/**
 * A group that owes more stars than it has cells left.
 *
 * The rules also detect shortfalls that span several groups; this is the check
 * for the one shape that can be read straight off the counters.
 */
function contradictionOf(state: CandidateState): Contradiction | null {
  const groups: Array<[GroupKind, number[], number[]]> = [
    ['region', state.regionNeed, state.freeRegions],
    ['row', state.rowNeed, state.freeRows],
    ['column', state.colNeed, state.freeCols],
  ]
  for (const [kind, needs, frees] of groups) {
    for (let index = 0; index < needs.length; index += 1) {
      const need = needs[index]!
      const free = frees[index]!
      if (need < 0 || (need > 0 && free < need)) {
        return { sources: [[kind, index]], homes: [], need, room: free }
      }
    }
  }
  return null
}

function explainedHint(state: CandidateState, cell: number, action: Hint['action'], rule: HintRule,
  sources: readonly Group[], homes: readonly Group[] = []): Hint {
  const { board } = state
  const piece = PUZZLE_PIECE[board.puzzleType]
  const count = (n: number) => pieceCount(board, n)
  const sourceCells = sources.flatMap(([kind, index]) => [...groupCells(state, kind, index)])
  const support = new Set([...sourceCells, ...homes.flatMap(([kind, index]) => [...groupCells(state, kind, index)])])
  // A placed piece outside the groups may explain why one of their cells is unavailable.
  for (const queen of state.queens) {
    if (!(queen >= 0 && queen < board.cellCount)) continue
    const q = board.coords(queen)
    if (sourceCells.some((c) => {
      const p = board.coords(c)
      return (p.row === q.row && state.rowNeed[q.row] === 0)
        || (p.col === q.col && state.colNeed[q.col] === 0)
        || (board.regionAt(c) === board.regionAt(queen) && state.regionNeed[board.regionAt(queen)] === 0)
        || (Math.abs(p.row - q.row) <= 1 && Math.abs(p.col - q.col) <= 1)
    })) support.add(queen)
  }
  support.delete(cell)
  const need = sources.reduce((total, group) => total + groupNeed(state, group), 0)
  const subject = `The ${sources.map((group) => groupName(state, group)).join(' and ')}`
  const demand = `${subject} still ${sources.length === 1 ? 'needs' : 'need'} ${count(need)}.`
  let reason: string
  if (homes.length) {
    reason = `${demand} All available cells in ${sources.length === 1 ? 'this group lie' : 'these groups lie'} in ${homes.map((group) => groupName(state, group)).join(' and ')}, with room for exactly ${need} more ${need === 1 ? piece.noun : piece.plural} in total. Those spaces must be reserved for ${sources.length === 1 ? 'this group' : 'these groups'}, so ${hintCellName(board, cell)} outside ${sources.length === 1 ? 'it' : 'them'} cannot hold a ${piece.noun}.`
  } else if (rule === 'fill') {
    reason = `${demand} There are exactly ${need} available cells left, so every one must hold a ${piece.noun}, including ${hintCellName(board, cell)}.`
  } else {
    reason = `${demand} Its only available cell is ${hintCellName(board, cell)}, so place a ${piece.noun} there.`
  }
  return { cell, action, rule, reason, support: [...support], sources, homes }
}

function deadHint(state: CandidateState, rule: HintRule, victims: readonly number[],
  sources: readonly Group[], homes: readonly Group[]): Hint | null {
  for (const cell of victims) {
    if (state.cand[cell]) return explainedHint(state, cell, 'x', rule, sources, homes)
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
          return explainedHint(state, cell, 'queen', rule, [[kind, group]])
        }
      } else if (need === frees[group]) {
        for (const cell of groupCells(state, kind, group)) {
          if (state.cand[cell]) {
            return explainedHint(state, cell, 'queen', 'fill', [[kind, group]])
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
      if (capacity < need) {
        state.contradiction ??= {
          sources: [['region', region]],
          homes: [...homes].map((home): Group => [kind, home]),
          need,
          room: capacity,
        }
        return null
      }
      if (capacity !== need) continue
      const dead = Array.from(homes).flatMap((line) =>
        groupCells(state, kind, line).filter(
          (cell) => state.board.regionAt(cell) !== region,
        ),
      )
      const hint = deadHint(state, 'intersection', dead, [['region', region]], [...homes].map((home) => [kind, home]))
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
      if (capacity < need) {
        state.contradiction ??= {
          sources: [[kind, line]],
          homes: [...regions].map((region): Group => ['region', region]),
          need,
          room: capacity,
        }
        return null
      }
      if (capacity !== need) continue
      const dead = Array.from(regions).flatMap((region) =>
        state.cellsOfRegion[region]!.filter(
          (cell) => state.board.coords(cell)[axis] !== line,
        ),
      )
      const hint = deadHint(state, 'intersection', dead, [[kind, line]], [...regions].map((region) => ['region', region]))
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
        if (room < stars) {
          state.contradiction ??= {
            sources: combo.map((group): Group => [source, group]),
            homes: [...homes].map((group): Group => [home, group]),
            need: stars,
            room,
          }
          return null
        }
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
        const hint = deadHint(state, 'subset', victims, combo.map((group) => [source, group]), [...homes].map((group) => [home, group]))
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
 * rules account for each group's remaining capacity, including multi-star boards.
 * Reading the same table the UI hides its button from keeps the two aligned.
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

/** Apply the pure rules until they stall or the state is contradictory. */
function runRules(state: CandidateState): void {
  while (!state.contradiction && !contradictionOf(state)) {
    const hint = huntSingles(state) ?? huntIntersections(state) ?? huntSubsets(state)
    if (!hint) return
    if (hint.action === 'queen') placeStar(state, hint.cell)
    else eliminate(state, hint.cell)
  }
}

function isComplete(state: CandidateState): boolean {
  return state.rowNeed.every((need) => need === 0)
}

/** The first candidate of the most constrained unfinished region. */
function pickGuess(state: CandidateState): number | null {
  let best: number | null = null
  let bestSlack = Number.POSITIVE_INFINITY
  for (let region = 0; region < state.board.size; region += 1) {
    const need = state.regionNeed[region]!
    if (need === 0) continue
    const slack = state.freeRegions[region]! - need
    if (slack < bestSlack) {
      bestSlack = slack
      best = region
    }
  }
  if (best === null) return null
  return state.cellsOfRegion[best]!.find((cell) => state.cand[cell] === 1) ?? null
}

type SearchOutcome =
  | { kind: 'solved' }
  | { kind: 'dead'; contradiction: Contradiction | null }
  | { kind: 'limit' }

/**
 * Depth-first hypothesis search with contradiction-based elimination.
 *
 * Mirrors `_guess_search` in the Python engine. A guessed star is a branch: if
 * every continuation of it dies, the guess is proven dead and the parent tries
 * again without it. `limit` means the node budget ran out, not that a solution
 * exists.
 */
function searchCompletion(state: CandidateState, budget: { left: number }): SearchOutcome {
  if (budget.left <= 0) return { kind: 'limit' }
  budget.left -= 1
  runRules(state)
  const contradiction = state.contradiction ?? contradictionOf(state)
  if (contradiction) return { kind: 'dead', contradiction }
  if (isComplete(state)) return { kind: 'solved' }
  const cell = pickGuess(state)
  if (cell === null) return { kind: 'dead', contradiction: null }
  const branch = cloneState(state)
  placeStar(branch, cell)
  const outcome = searchCompletion(branch, budget)
  if (outcome.kind !== 'dead') return outcome
  eliminate(state, cell)
  return searchCompletion(state, budget)
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1)
}

function describeContradiction(state: CandidateState, contradiction: Contradiction): string {
  const { board } = state
  const sources = contradiction.sources.map((group) => groupName(state, group))
  if (!contradiction.homes.length) {
    const left = contradiction.room === 0 ? 'no cells are' : contradiction.room === 1 ? 'one cell is' : `${contradiction.room} cells are`
    return `The ${sources[0]} would still need ${pieceCount(board, contradiction.need)} but ${left} left.`
  }
  const homes = contradiction.homes.map((group) => groupName(state, group))
  const subject = `The ${sources.join(' and ')}`
  return `${subject} would still need ${pieceCount(board, contradiction.need)}${sources.length === 1 ? '' : ' together'}, but all ${sources.length === 1 ? 'its' : 'their'} remaining cells lie in ${homes.join(' and ')}, which ${homes.length === 1 ? 'has' : 'have'} room for only ${pieceCount(board, contradiction.room)}.`
}

function trialHintFor(state: CandidateState, cell: number, action: Hint['action'],
  contradiction: Contradiction, searched: boolean): Hint {
  const { board } = state
  const piece = PUZZLE_PIECE[board.puzzleType]
  const name = hintCellName(board, cell)
  const detail = lowerFirst(describeContradiction(state, contradiction))
  const reason = action === 'x'
    ? searched
      ? `A ${piece.noun} at ${name} cannot work: every continuation runs out of room. For example, ${detail} So ${name} must be marked X.`
      : `If a ${piece.noun} were at ${name}, the forced moves would run out of room: ${detail} So ${name} must be marked X.`
    : searched
      ? `If ${name} were empty, the board could not be completed. For example, ${detail} So it must hold a ${piece.noun}.`
      : `If ${name} were empty, the forced moves would run out of room: ${detail} So it must hold a ${piece.noun}.`
  const support = new Set<number>()
  for (const [kind, index] of [...contradiction.sources, ...contradiction.homes]) {
    for (const groupCell of groupCells(state, kind, index)) support.add(groupCell)
  }
  support.delete(cell)
  return {
    cell, action, rule: 'trial', reason, support: [...support],
    sources: contradiction.sources, homes: contradiction.homes,
  }
}

/**
 * A hint that assumes the opposite of the truth and follows it to a contradiction.
 *
 * Pure rules stall on many Star Battle boards. The app still knows the verified
 * unique solution, but saying "this cell is not in the solution" explains
 * nothing. So each candidate is tried with the *wrong* assumption for that cell:
 * a star where the solution has none, or no star where it has one. If the rules
 * then run out of room without any further guessing, the assumption is refuted
 * by a chain a player could follow, and the hint reports that chain.
 *
 * When no single assumption refutes itself, the bounded search does the same
 * thing several moves deep: it proves the assumption dead only by exhausting
 * every continuation, which is a legitimate but longer explanation. It returns
 * null when the budget runs out before either proof completes.
 */
export function trialHint(
  board: Board,
  queens: ReadonlySet<number>,
  marks: ReadonlySet<number>,
  solution: ReadonlySet<number>,
): Hint | null {
  if (solution.size !== starsPerRow(board) * board.size) return null
  const state = initialState(board, queens, marks)
  if (contradictionOf(state)) return null
  for (let cell = 0; cell < board.cellCount; cell += 1) {
    if (!state.cand[cell]) continue
    const queen = solution.has(cell)
    const branch = cloneState(state)
    if (queen) eliminate(branch, cell)
    else placeStar(branch, cell)
    runRules(branch)
    const contradiction = branch.contradiction ?? contradictionOf(branch)
    if (contradiction) {
      return trialHintFor(state, cell, queen ? 'queen' : 'x', contradiction, false)
    }
  }

  // No single assumption refutes itself, so prove one dead with a deeper search,
  // starting where the board has least room to manoeuvre. Non-solution cells come
  // first: assuming a star consumes capacity, which tends to refute sooner than
  // assuming a solution cell empty.
  const regions = Array.from({ length: board.size }, (_, region) => region)
    .filter((region) => state.regionNeed[region]! > 0)
    .sort((a, b) =>
      (state.freeRegions[a]! - state.regionNeed[a]!) - (state.freeRegions[b]! - state.regionNeed[b]!)
      || a - b,
    )
  for (const region of regions) {
    const candidates = state.cellsOfRegion[region]!
      .filter((cell) => state.cand[cell] === 1)
      .sort((a, b) => Number(solution.has(a)) - Number(solution.has(b)) || a - b)
    for (const cell of candidates) {
      const queen = solution.has(cell)
      const branch = cloneState(state)
      if (queen) eliminate(branch, cell)
      else placeStar(branch, cell)
      const outcome = searchCompletion(branch, { left: 4000 })
      if (outcome.kind !== 'dead' || !outcome.contradiction) continue
      return trialHintFor(state, cell, queen ? 'queen' : 'x', outcome.contradiction, true)
    }
  }
  return null
}
