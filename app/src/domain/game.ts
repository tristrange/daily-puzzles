/**
 * Player state for one puzzle: which cells hold a placed piece and which are
 * marked out. Cell interactions (place/take-back/mark) are pure transitions so
 * the game loop in M7 can layer undo and win detection on top without UI state.
 *
 * The state field is named `queens` throughout, and a placed piece is called a
 * queen, because the hint contract (`Hint.action: 'queen'`, the Python engine's
 * `ForcedMove`) is shared with the engine and the engine speaks of stars. For a
 * Star Battle board the same set holds stars: the *rules* are capacity-aware
 * (`starsPerRow`), so "queens" here is a name, not a claim.
 *
 * A piece is only meaningful when it does not overfill a row, column or region
 * and is not adjacent (diagonally included) to another. `conflicts` reports
 * violations so the UI can flag them and the hint engine can refuse to reason
 * over a poisoned board.
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

/**
 * Stars every row must hold: 1 for Queens, k for a k-star Star Battle. Read
 * from the board's own capacities, the same numbers the solver honours.
 */
export function starsPerRow(board: Board): number {
  const total = board.regionCapacity.reduce((sum, capacity) => sum + capacity, 0)
  return total / board.size
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

/**
 * The state one click would move `cell` to, without changing anything: empty
 * becomes a mark, a mark becomes a piece, a piece goes back to empty. Split
 * out from `cycleCell` so callers that need to know the target first (the auto-
 * mark toggle wants to know whether a click is about to place a piece) do not
 * have to apply a transition just to inspect it.
 */
export function nextCellState(game: GameState, cell: number): CellState {
  const current = cellState(game, cell)
  if (current === 'empty') return 'mark'
  if (current === 'mark') return 'queen'
  return 'empty'
}

/**
 * Force `cell` into `state`, clearing whatever it held before.
 *
 * A primitive with no policy in it: it will happily put a mark over a piece or
 * clear one, because the paths that do that on purpose — a click cycling a piece
 * away, the keyboard clearing a cell — need it to. The rule about strokes not
 * touching pieces lives in `paintStroke`, where it can be read and tested.
 */
export function setCell(game: GameState, cell: number, state: CellState): GameState {
  return {
    board: game.board,
    queens: state === 'queen' ? withValue(game.queens, cell) : without(game.queens, cell),
    marks: state === 'mark' ? withValue(game.marks, cell) : without(game.marks, cell),
  }
}

/**
 * One cell of a drag stroke.
 *
 * A stroke only ever adds or removes marks, so a piece is not its business:
 * dragging out a run of exclusions should not un-place a queen on the way, which
 * is a surprise with nothing on screen to predict it. Both targets are covered,
 * not just painting a cross — a stroke that *starts* on a marked cell erases,
 * and its target is `empty`, so guarding only the `mark` case would let an erase
 * stroke sweep pieces off the board just as destructively.
 *
 * Pieces are still removable: clicking one cycles it away, which is a
 * deliberate act on a cell the player aimed at.
 */
export function paintStroke(
  game: GameState,
  cell: number,
  target: 'mark' | 'empty',
): GameState {
  if (game.queens.has(cell)) return game
  return setCell(game, cell, target)
}

/**
 * One click on a cell, cycling empty -> mark -> piece -> empty. Crossing out
 * is the first stop because it is by far the most common action, and a second
 * click promotes a mark to a piece.
 */
export function cycleCell(game: GameState, cell: number): GameState {
  return setCell(game, cell, nextCellState(game, cell))
}

export function cellState(game: GameState, cell: number): CellState {
  if (game.queens.has(cell)) return 'queen'
  if (game.marks.has(cell)) return 'mark'
  return 'empty'
}

/**
 * Every cell a piece at `cell` rules out on its own. For Queens (one per row,
 * column, region) that is its row, column, region and the eight surrounding
 * cells, deduplicated and sorted — exactly the set the hint engine eliminates
 * when it simulates a placement, so auto-marking the same cells keeps the
 * visible board in lockstep with the engine. A k-star board keeps a piece's
 * row, column and region open to more stars, so only the eight touching cells
 * are ever dead: a deliberately conservative auto-mark, and the only set that
 * is correct without consulting the rest of the player's stars.
 */
export function cellsEliminated(board: Board, cell: number): readonly number[] {
  if (board.puzzleType !== 'queens') {
    return [...touching(board, cell)].sort((a, b) => a - b)
  }
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
 * Place a piece and mark every cell it rules out, unless a piece already sits
 * there (conflicts are the player's to resolve). Toggling a piece off behaves
 * exactly like `toggleQueen`; the marks it created are not withdrawn.
 */
export function placeQueenAutoMark(game: GameState, cell: number): GameState {
  if (game.queens.has(cell)) {
    return { ...game, queens: without(game.queens, cell) }
  }
  const queens = withValue(game.queens, cell)
  const marks = new Set(game.marks)
  marks.delete(cell)
  for (const eliminated of cellsEliminated(game.board, cell)) {
    if (!queens.has(eliminated)) marks.add(eliminated)
  }
  return { board: game.board, queens, marks }
}

/**
 * The board is solved once it holds `starsPerRow * size` pieces that conflict
 * with nothing. With no conflicts that count fills every row, column and region
 * exactly (the capacities sum to the same total), which is the win condition
 * for both puzzle types.
 */
export function isSolved(game: GameState): boolean {
  const needed = starsPerRow(game.board) * game.board.size
  return game.queens.size === needed && conflicts(game).length === 0
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

/** Every conflict among the placed pieces; empty when the placement is valid. */
export function conflicts(game: GameState): readonly Conflict[] {
  const found: Conflict[] = []
  const queens = [...game.queens].sort((a, b) => a - b)
  const board = game.board
  const perRow = starsPerRow(board)
  const rowCount = new Map<number, number>()
  const colCount = new Map<number, number>()
  const regionCount = new Map<number, number>()
  for (const cell of queens) {
    const { row, col } = board.coords(cell)
    const region = board.regionAt(cell)
    rowCount.set(row, (rowCount.get(row) ?? 0) + 1)
    colCount.set(col, (colCount.get(col) ?? 0) + 1)
    regionCount.set(region, (regionCount.get(region) ?? 0) + 1)
  }
  for (let i = 0; i < queens.length; i += 1) {
    const a = queens[i]
    if (a === undefined) continue
    for (let j = i + 1; j < queens.length; j += 1) {
      const b = queens[j]
      if (b === undefined) continue
      const conflict = conflictBetween(board, a, b, { perRow, rowCount, colCount, regionCount })
      if (conflict) found.push(conflict)
    }
  }
  return found
}

interface GroupCounts {
  perRow: number
  rowCount: ReadonlyMap<number, number>
  colCount: ReadonlyMap<number, number>
  regionCount: ReadonlyMap<number, number>
}

/**
 * The conflict between two placed pieces, or `null` if they are compatible.
 *
 * Rule precedence is row > column > region > touch, so a pair is reported under
 * the most specific rule it breaks. A shared group only *breaks* a rule once it
 * is over capacity: two stars in one k-star region are exactly what the region
 * asked for. For Queens (capacity 1) every shared group is over capacity, so
 * the behaviour is the one M6 shipped.
 */
function conflictBetween(
  board: Board,
  a: number,
  b: number,
  counts: GroupCounts,
): Conflict | null {
  const { row: ar, col: ac } = board.coords(a)
  const { row: br, col: bc } = board.coords(b)
  const over = (used: number | undefined, capacity: number): boolean => (used ?? 0) > capacity
  if (ar === br && over(counts.rowCount.get(ar), counts.perRow)) return { rule: 'row', cells: [a, b] }
  if (ac === bc && over(counts.colCount.get(ac), counts.perRow)) {
    return { rule: 'column', cells: [a, b] }
  }
  const region = board.regionAt(a)
  if (region === board.regionAt(b)) {
    const capacity = board.regionCapacity[region] ?? 1
    if (over(counts.regionCount.get(region), capacity)) return { rule: 'region', cells: [a, b] }
  }
  if (Math.abs(ar - br) <= 1 && Math.abs(ac - bc) <= 1) return { rule: 'touch', cells: [a, b] }
  return null
}