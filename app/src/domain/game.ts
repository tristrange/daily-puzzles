/**
 * Player state for one puzzle: which cells hold a queen and which are marked
 * out. Cell interactions (place/take-back/mark) are pure transitions so the
 * game loop in M7 can layer undo and win detection on top without UI state.
 *
 * A queen is only meaningful when it does not share a row, column or region
 * with another queen, and is not adjacent (diagonally included) to one.
 * `conflicts` reports violations so the UI can flag them and the hint engine
 * can refuse to reason over a poisoned board.
 */

import type { Board } from './board'

export type CellState = 'empty' | 'queen' | 'mark'

export interface GameState {
  board: Board
  queens: ReadonlySet<number>
  marks: ReadonlySet<number>
}

export type ConflictRule = 'row' | 'column' | 'region' | 'touch'

export interface Conflict {
  rule: ConflictRule
  /** The two cells involved, in ascending index order. */
  cells: [number, number]
}

export function createGame(board: Board): GameState {
  return { board, queens: new Set(), marks: new Set() }
}

function without(set: ReadonlySet<number>, value: number): ReadonlySet<number> {
  const next = new Set(set)
  next.delete(value)
  return next
}

function withValue(set: ReadonlySet<number>, value: number): ReadonlySet<number> {
  const next = new Set(set)
  next.add(value)
  return next
}

/** Place or take back the queen on `cell`. Marking is cleared by a queen. */
export function toggleQueen(game: GameState, cell: number): GameState {
  if (game.queens.has(cell)) {
    return { ...game, queens: without(game.queens, cell) }
  }
  const queens = withValue(game.queens, cell)
  return { board: game.board, queens, marks: without(game.marks, cell) }
}

/** Add or remove an X mark on `cell`. A placed queen is removed by a mark. */
export function toggleMark(game: GameState, cell: number): GameState {
  if (game.marks.has(cell)) {
    return { ...game, marks: without(game.marks, cell) }
  }
  const marks = withValue(game.marks, cell)
  return { board: game.board, queens: without(game.queens, cell), marks }
}

/** Clear a cell back to empty, whether it held a queen or a mark. */
export function clearCell(game: GameState, cell: number): GameState {
  return {
    board: game.board,
    queens: without(game.queens, cell),
    marks: without(game.marks, cell),
  }
}

export function cellState(game: GameState, cell: number): CellState {
  if (game.queens.has(cell)) return 'queen'
  if (game.marks.has(cell)) return 'mark'
  return 'empty'
}

/**
 * Every cell a queen at `cell` rules out: its row, column, region and the eight
 * surrounding cells, deduplicated and sorted. This is exactly the set the hint
 * engine eliminates when it simulates a placement, so auto-marking the same
 * cells keeps the visible board in lockstep with the engine.
 */
export function cellsEliminatedByQueen(board: Board, cell: number): readonly number[] {
  const { row, col } = board.coords(cell)
  const region = board.regionAt(cell)
  const eliminated = new Set<number>()
  for (let step = 0; step < board.size; step += 1) {
    eliminated.add(board.index(row, step))
    eliminated.add(board.index(step, col))
  }
  for (const sibling of board.cellsOfRegion(region)) eliminated.add(sibling)
  for (const neighbour of touching(board, cell)) eliminated.add(neighbour)
  return [...eliminated].sort((a, b) => a - b)
}

/**
 * Place a queen and mark every cell it rules out, unless a queen already sits
 * there (conflicts are the player's to resolve). Toggling a queen off behaves
 * exactly like `toggleQueen`; the marks it created are not withdrawn.
 */
export function placeQueenAutoMark(game: GameState, cell: number): GameState {
  if (game.queens.has(cell)) {
    return { ...game, queens: without(game.queens, cell) }
  }
  const queens = withValue(game.queens, cell)
  const marks = new Set(game.marks)
  marks.delete(cell)
  for (const eliminated of cellsEliminatedByQueen(game.board, cell)) {
    if (!queens.has(eliminated)) marks.add(eliminated)
  }
  return { board: game.board, queens, marks }
}

/** The board is solved when every row holds a queen and no two conflict. */
export function isSolved(game: GameState): boolean {
  return game.queens.size === game.board.size && conflicts(game).length === 0
}

/** A duration in milliseconds, formatted `m:ss` (e.g. `9:07`, `45:00`). */
export function formatTime(totalMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(totalMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function touching(board: Board, cell: number): readonly number[] {
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

/** Every conflict among the placed queens; empty when the queens are valid. */
export function conflicts(game: GameState): readonly Conflict[] {
  const found: Conflict[] = []
  const queens = [...game.queens].sort((a, b) => a - b)
  const board = game.board
  for (let i = 0; i < queens.length; i += 1) {
    const a = queens[i]
    if (a === undefined) continue
    for (let j = i + 1; j < queens.length; j += 1) {
      const b = queens[j]
      if (b === undefined) continue
      const conflict = conflictBetween(board, a, b)
      if (conflict) found.push(conflict)
    }
  }
  return found
}

/** The conflict between two placed queens, or `null` if they are compatible. */
function conflictBetween(board: Board, a: number, b: number): Conflict | null {
  const { row: ar, col: ac } = board.coords(a)
  const { row: br, col: bc } = board.coords(b)
  const rule: ConflictRule =
    ar === br ? 'row' : ac === bc ? 'column' : board.regionAt(a) === board.regionAt(b) ? 'region' : 'touch'
  if (rule !== 'touch' || (Math.abs(ar - br) <= 1 && Math.abs(ac - bc) <= 1)) {
    return { rule, cells: [a, b] }
  }
  return null
}