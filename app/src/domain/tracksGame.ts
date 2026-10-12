/**
 * Player state for a Train Tracks board, and the rules it has to satisfy.
 *
 * The marks games in `game.ts` record which cells hold a piece and which are
 * marked out, because a mark is a count against a region. Here a cell holds a
 * *piece number*, and whether that is correct is decided by its neighbours rather
 * than by any count of its own: the piece is what says which directions the line
 * joins, and reciprocity is what makes two adjacent track cells need not join.
 *
 * Cell interactions are pure transitions, as in `game.ts`, so the view can layer
 * undo and win detection on top without holding UI state.
 */

import {
  EAST,
  LINE_ENDS,
  NORTH,
  OPPOSITE,
  PIECE_COUNT,
  PIECE_ENDS,
  SOUTH,
  WEST,
  endsTowards,
  TrackGrid,
} from './tracks'

export interface TracksGame {
  grid: TrackGrid
  /** One piece number per cell, row-major, `0` for an empty cell. */
  pieces: readonly number[]
}

/** The board as a player first sees it: the givens and nothing else. */
export function createTracksGame(grid: TrackGrid): TracksGame {
  return { grid, pieces: [...grid.givens] }
}

/** Why a cell is wrong, named so the view can say so rather than just red it. */
export type TrackConflictRule =
  | 'mismatched-end'
  | 'unfinished-end'
  | 'off-grid-end'
  | 'row-count'
  | 'col-count'

/**
 * Whether this rule is a fault the player has made.
 *
 * `unfinished-end` is not, and the difference is the whole point of it: an end
 * pointing at an empty cell is what every board looks like while it is being
 * solved. Marking those red, or reporting them in the status line, tells someone
 * mid-solve that their work is broken — and a marker that cries wolf gets ignored,
 * at which point it is not doing its job either.
 *
 * The rules still count towards `isTracksSolved`, which is where "unfinished"
 * belongs.
 */
export function isFault(rule: TrackConflictRule): boolean {
  return rule !== 'unfinished-end'
}

export interface TrackConflict {
  rule: TrackConflictRule
  /** The cell at fault. The cell it conflicts *with* is named too where there is one. */
  cell: number
  /** The neighbour or partner cell, for the two-sided rules. */
  other?: number
}

/**
 * The two notes a player can leave in a cell, beside the six pieces.
 *
 * `CROSS` is "no track here" and `MAYBE` is "a track here, direction not decided".
 * The second is the one this genre needs and the marks board does not: a row clue
 * that is nearly spent fixes that a cell holds *something* a good while before it
 * fixes which of six, and there is no way to write that down without a second note.
 *
 * They are values in the same array as the pieces rather than a set beside it. A
 * cell holds exactly one of empty, a piece, a cross or a maybe, so a second
 * collection would be a second thing to keep exclusive that already cannot
 * collide — and every reader of `pieces` would have to remember to check it.
 */
export const CROSS = PIECE_COUNT + 1
export const MAYBE = PIECE_COUNT + 2

/**
 * What a click puts in the cell, which is one of the values above — or `0`, which
 * erases.
 *
 * A number and not a tagged union, because the picker, the keyboard and the drag
 * all want the same thing: the value to leave behind. The eraser is `0` for free
 * rather than as a case: `applyBrush` toggles, so "put 0 here" on a cell that
 * already holds 0 changes nothing and records no undo step, which is exactly what
 * running an eraser over empty board should do.
 */
export type TrackBrush = number

/** The picker entries, in the order they are drawn: notes, then pieces, then the eraser. */
export const TRACK_BRUSHES: readonly TrackBrush[] = [
  CROSS,
  MAYBE,
  1,
  2,
  3,
  4,
  5,
  6,
  0,
]

/** Every value a cell can hold, in words a screen reader can say aloud. */
export const TRACK_CELL_NAME: readonly string[] = [
  'empty',
  'a horizontal track',
  'a vertical track',
  'a track turning north to east',
  'a track turning east to south',
  'a track turning south to west',
  'a track turning west to north',
  'marked out',
  'a track, direction not decided',
]

/**
 * Put `brush` in `cell`, or take it back if that is already there.
 *
 * The toggle is what makes one gesture enough for every entry in the picker. A
 * click with the cross already up means *undo that cross*, not "do nothing", so a
 * misjudged click is undone by clicking the same thing again rather than by first
 * finding the eraser and then the piece you had before it. Every other board
 * interaction in this app — including the marks board's stroke — was written to
 * the same rule for the same reason.
 *
 * A given is left alone, as everywhere else. The player cannot change a clue, so
 * clicking one should say so by doing nothing rather than appearing to work.
 *
 * Returns the same object when nothing changes, which is how the view knows not to
 * push a history entry for a click that did nothing.
 */
export function applyBrush(game: TracksGame, cell: number, brush: TrackBrush): TracksGame {
  if (game.grid.pieceAt(cell) !== 0) return game
  const current = game.pieces[cell] ?? 0
  const next = current === brush ? 0 : brush
  if (next === current) return game
  return { grid: game.grid, pieces: replace(game.pieces, cell, next) }
}

/** Clear `cell` back to empty. A given is left alone; it is the clue. */
export function clearCell(game: TracksGame, cell: number): TracksGame {
  if (game.grid.pieceAt(cell) !== 0) return game
  if ((game.pieces[cell] ?? 0) === 0) return game
  return { grid: game.grid, pieces: replace(game.pieces, cell, 0) }
}

/** Every piece off the board that is not a given, leaving it as newly opened. */
export function resetGame(game: TracksGame): TracksGame {
  return createTracksGame(game.grid)
}

/** Whether the board holds nothing the player placed, so a reset would do nothing. */
export function isEmpty(game: TracksGame): boolean {
  return game.pieces.every((piece, cell) => piece === game.grid.givens[cell])
}

function replace(pieces: readonly number[], cell: number, value: number): number[] {
  const next = [...pieces]
  next[cell] = value
  return next
}

/**
 * Whether a cell holds a piece.
 *
 * Named for what it means rather than kept as `isOn`, because a cell can now hold
 * something that is not a piece — a cross, a maybe — and every caller of the old
 * name wanted the piece. A cross has to count towards nothing: not towards a row
 * clue, not as a pair of ends, not as a cell the line has to reach. Reading a
 * cross as a piece would have made the win condition pass on a board with two
 * crosses in it.
 */
export function hasPiece(game: TracksGame, cell: number): boolean {
  const value = game.pieces[cell] ?? 0
  return value !== 0 && value <= PIECE_COUNT
}

/** What `cell` holds, as one of the four things a cell can be. */
export function cellState(game: TracksGame, cell: number): 'empty' | 'piece' | 'cross' | 'maybe' {
  const value = game.pieces[cell] ?? 0
  if (value === 0) return 'empty'
  if (value === CROSS) return 'cross'
  if (value === MAYBE) return 'maybe'
  return 'piece'
}

/**
 * Every way the placement is locally wrong: an end nothing meets, an end running
 * off the edge when only two may, a row or column over its clue.
 *
 * Local rather than global on purpose. Whether the pieces form one line is a
 * property of the whole board and only means anything once the counts are met, so
 * reporting it as a conflict would flag a half-finished board as wrong. These are
 * the rules a player can break and see immediately.
 */
export function trackConflicts(game: TracksGame): readonly TrackConflict[] {
  const found: TrackConflict[] = []
  const { grid } = game
  const rowCount = new Array<number>(grid.height).fill(0)
  const colCount = new Array<number>(grid.width).fill(0)

  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (!hasPiece(game, cell)) continue
    const { row, col } = grid.coords(cell)
    rowCount[row] = (rowCount[row] ?? 0) + 1
    colCount[col] = (colCount[col] ?? 0) + 1
  }

  // Off-grid ends are counted before any is reported, because two of them are the
  // line's *open ends* — required, not wrong. Only a third is an error, and
  // reporting it per cell is only meaningful once there is one to report.
  const openEnds: number[] = []
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (!hasPiece(game, cell)) continue
    for (const direction of pieceEnds(game.pieces[cell] ?? 0)) {
      if (grid.neighbour(cell, direction) === null) openEnds.push(cell)
    }
  }

  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (!hasPiece(game, cell)) continue
    const piece = game.pieces[cell] ?? 0
    for (const direction of pieceEnds(piece)) {
      const other = grid.neighbour(cell, direction)
      const back = (direction + OPPOSITE) % 4
      if (other === null) continue // judged above, by the total
      // Three situations, and the player has to be told the first two apart. An
      // empty cell is a route not finished yet; a cell facing the other way is a
      // piece that is wrong. Reporting both as the same fault tells someone
      // mid-solve that their correctly-placed work is broken.
      if (!hasPiece(game, other)) {
        found.push({ rule: 'unfinished-end', cell, other })
      } else if (!endsTowards(game.pieces[other] ?? 0, back)) {
        // Reciprocity is symmetric, so only the cell whose end found this
        // reports it — and that cell may be a given, which the player cannot
        // change. A red cell nothing can be done about is worse than no red cell:
        // the fault belongs on the piece they can correct.
        const blameGiven =
          grid.pieceAt(cell) !== 0 && grid.pieceAt(other) === 0
        found.push(
          blameGiven
            ? { rule: 'mismatched-end', cell: other, other: cell }
            : { rule: 'mismatched-end', cell, other },
        )
      }
    }
  }
  if (openEnds.length > LINE_ENDS) {
    // Only the player's. The grid's two given ends are correct by construction —
    // the validator refuses any grid that does not have exactly two — so marking
    // them would point at two fixed clues the player cannot change, and hide the
    // extra end they just placed.
    for (const cell of openEnds) {
      if (grid.pieceAt(cell) === 0) found.push({ rule: 'off-grid-end', cell })
    }
  }

  // Only the cells the player can clear. An over-full line is fixed by removing a
  // piece from it, so outlining the empty cells alongside — or the fixed givens —
  // points at cells where the only available action makes the error worse.
  for (let row = 0; row < grid.height; row += 1) {
    if ((rowCount[row] ?? 0) <= (grid.rowClues[row] ?? 0)) continue
    for (let col = 0; col < grid.width; col += 1) {
      const cell = grid.index(row, col)
      if (hasPiece(game, cell) && grid.pieceAt(cell) === 0) {
        found.push({ rule: 'row-count', cell, other: row })
      }
    }
  }
  for (let col = 0; col < grid.width; col += 1) {
    if ((colCount[col] ?? 0) <= (grid.colClues[col] ?? 0)) continue
    for (let row = 0; row < grid.height; row += 1) {
      const cell = grid.index(row, col)
      if (hasPiece(game, cell) && grid.pieceAt(cell) === 0) {
        found.push({ rule: 'col-count', cell, other: col })
      }
    }
  }
  return found
}

function pieceEnds(piece: number): readonly number[] {
  return PIECE_ENDS[piece] ?? []
}

/**
 * The board is solved once the pieces form one line.
 *
 * Four conditions, and each is doing work the others cannot:
 *
 * - **Givens honoured.** The player cannot change a given, so this is free — but
 *   the check is stated because it is the one rule a file can violate and a player
 *   cannot.
 * - **Reciprocity.** Every end is met. `trackConflicts` reports the same thing
 *   one cell at a time; here it is a precondition rather than a complaint.
 * - **Counts.** Every row and column holds exactly its clue. Below the clue is a
 *   puzzle still in progress, not a wrong answer, so this asks for equality.
 * - **One path.** Reciprocity plus exactly two open ends gives every cell two
 *   ends, so two cells have one neighbour and the rest have two — which admits a
 *   single path *and* any number of separate loops. The line has to be the whole
 *   of it, which is what the connectivity check is for.
 *
 * Crosses and maybes are not consulted. A note is the player's reasoning, not a
 * claim the answer can fail: someone who has crossed out a cell the finished line
 * does not use has been right all along, and someone whose last `?` outlived the
 * piece they were undecided about has a stale note, not a wrong answer. Blocking
 * a solve over either would mean the last note before finishing was the thing
 * standing between them and finishing. Reset clears them.
 */
export function isTracksSolved(game: TracksGame): boolean {
  const { grid } = game
  // A given of 0 means "no clue", not "must stay empty": the player fills those
  // cells like any other. Only a non-zero given is a constraint.
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    const given = grid.givens[cell] ?? 0
    if (given !== 0 && (game.pieces[cell] ?? 0) !== given) return false
  }
  if (trackConflicts(game).length > 0) return false

  const openEnds: number[] = []
  const seen = new Set<number>()
  const rowCount = new Array<number>(grid.height).fill(0)
  const colCount = new Array<number>(grid.width).fill(0)
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (!hasPiece(game, cell)) continue
    const { row, col } = grid.coords(cell)
    rowCount[row] = (rowCount[row] ?? 0) + 1
    colCount[col] = (colCount[col] ?? 0) + 1
    for (const direction of pieceEnds(game.pieces[cell] ?? 0)) {
      if (grid.neighbour(cell, direction) === null) openEnds.push(cell)
    }
  }
  if (openEnds.length !== LINE_ENDS) return false

  // Equality, not the ceiling `trackConflicts` checks. A row or column holding
  // *less* than its clue raises no local conflict, and reciprocity plus exactly
  // two open ends does not rule it out either — it is a perfectly good path, just
  // not the one this grid asked for. Without this the app records a solve for a
  // board that is short in a line, which is the one thing the clues exist to say.
  for (let row = 0; row < grid.height; row += 1) {
    if ((rowCount[row] ?? 0) !== grid.rowClues[row]) return false
  }
  for (let col = 0; col < grid.width; col += 1) {
    if ((colCount[col] ?? 0) !== grid.colClues[col]) return false
  }

  // Walk the line from one of its two ends. Reaching every occupied cell is what
  // "one line" means; anything left over is a second path or a closed loop.
  const start = openEnds[0]
  if (start === undefined) return false
  let current = start
  seen.add(current)
  for (;;) {
    const next = pieceEnds(game.pieces[current] ?? 0)
      .map((direction) => grid.neighbour(current, direction))
      .find((other): other is number => other !== null && !seen.has(other))
    if (next === undefined) break
    seen.add(next)
    current = next
  }
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (hasPiece(game, cell) && !seen.has(cell)) return false
  }
  return true
}

export { EAST, NORTH, SOUTH, WEST }