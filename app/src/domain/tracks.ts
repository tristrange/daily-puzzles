/**
 * Train Tracks: one continuous line, counted by row and by column.
 *
 * Mirrors `engine/src/queens_engine/tracks.py` rule for rule. Both sides are pinned
 * by the shared `conformance/` suites, so a divergence here fails CI rather than
 * shipping.
 *
 * The model is a piece number per cell, `0` for an empty cell, and three rules
 * decide which arrangements are legal:
 *
 * - **Reciprocity.** A piece's end must be met by a neighbour's end facing back.
 *   Without it, adjacency would decide everything and a line running alongside
 *   itself would be indistinguishable from one turning.
 * - **One path.** The pieces form a single connected line, so there are exactly
 *   two ends and both run off the edge of the grid rather than stopping at a cell.
 * - **Counts.** `rowClues` and `colClues` say how many cells each line occupies.
 */

/** Compass order, so a direction's opposite is `(d + 2) % 4`. */
export const NORTH = 0
export const EAST = 1
export const SOUTH = 2
export const WEST = 3
export const DIRECTIONS = 4
export const OPPOSITE = 2

/** The piece in each cell, indexed by the number the format uses. */
export const PIECE_ENDS: readonly (readonly number[])[] = [
  [],
  [EAST, WEST],
  [NORTH, SOUTH],
  [NORTH, EAST],
  [EAST, SOUTH],
  [SOUTH, WEST],
  [WEST, NORTH],
]

/** How many pieces a cell may hold, and the last piece's number. */
export const PIECE_COUNT = PIECE_ENDS.length - 1

/** A line has two ends, and both run off the grid rather than stopping at a cell. */
export const LINE_ENDS = 2

/** One piece number per cell, row-major, `0` for an empty cell. */
export type Assignment = readonly number[]

/**
 * What each piece looks like, indexed by piece number.
 *
 * Drawn rather than named because the whole point of the puzzle is telling a line
 * running alongside itself from one turning, and a glyph shows that where a letter
 * would hide it. Mirrors `PIECE_GLYPHS` in the engine's `render.py`.
 */
export const PIECE_GLYPHS: readonly string[] = [' ', '─', '│', '└', '┌', '┐', '┘']

export class TrackGridError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TrackGridError'
  }
}

export class TrackGrid {
  readonly width: number
  readonly height: number
  readonly rowClues: readonly number[]
  readonly colClues: readonly number[]
  readonly givens: readonly number[]
  readonly cellCount: number

  constructor(
    width: number,
    height: number,
    rowClues: readonly number[],
    colClues: readonly number[],
    givens: readonly number[],
  ) {
    this.width = width
    this.height = height
    this.rowClues = rowClues
    this.colClues = colClues
    this.givens = givens
    this.cellCount = this.width * this.height
    validateTrackGrid(this)
  }

  /** How many cells the line occupies, the same whichever way it is counted. */
  get total(): number {
    return this.rowClues.reduce((sum, count) => sum + count, 0)
  }

  index(row: number, col: number): number {
    return row * this.width + col
  }

  coords(index: number): { row: number; col: number } {
    return { row: Math.floor(index / this.width), col: index % this.width }
  }

  pieceAt(index: number): number {
    const piece = this.givens[index]
    if (piece === undefined) {
      throw new TrackGridError(`cell index ${index} out of range`)
    }
    return piece
  }

  /** Which directions the piece in `index` ends in. */
  endsAt(index: number): readonly number[] {
    return PIECE_ENDS[this.pieceAt(index)] ?? []
  }

  /**
   * The cell in `direction` of `index`, or `null` off the edge of the grid.
   *
   * `null` is the answer that matters: an end facing `null` is one of the line's
   * two open ends, and there are exactly two of those in a solved grid.
   */
  neighbour(index: number, direction: number): number | null {
    const { row, col } = this.coords(index)
    switch (direction) {
      case NORTH:
        return row === 0 ? null : index - this.width
      case EAST:
        return col === this.width - 1 ? null : index + 1
      case SOUTH:
        return row === this.height - 1 ? null : index + this.width
      default:
        return col === 0 ? null : index - 1
    }
  }
}

/** The directions `piece` ends in. Index 0 is an empty cell and ends nowhere. */
function pieceEnds(piece: number): readonly number[] {
  return PIECE_ENDS[piece] ?? []
}

/** Whether `piece` has an end facing `direction`. */
export function endsTowards(piece: number, direction: number): boolean {
  return (PIECE_ENDS[piece] ?? []).includes(direction)
}

function checkClues(clues: readonly number[], length: number, name: string): void {
  for (const [position, count] of clues.entries()) {
    if (count < 0 || count > length) {
      throw new TrackGridError(
        `${name} clue ${position} is ${count}, but a ${name} holds ${length} cells`,
      )
    }
  }
}

export function validateTrackGrid(grid: TrackGrid): void {
  if (grid.width < 1 || grid.height < 1) {
    throw new TrackGridError(
      `a track grid needs a positive size, got ${grid.width}x${grid.height}`,
    )
  }
  if (grid.rowClues.length !== grid.height) {
    throw new TrackGridError(
      `${grid.height} rows, got ${grid.rowClues.length} row clues`,
    )
  }
  if (grid.colClues.length !== grid.width) {
    throw new TrackGridError(
      `${grid.width} columns, got ${grid.colClues.length} column clues`,
    )
  }
  checkClues(grid.rowClues, grid.width, 'row')
  checkClues(grid.colClues, grid.height, 'column')
  const rows = grid.rowClues.reduce((sum, count) => sum + count, 0)
  const cols = grid.colClues.reduce((sum, count) => sum + count, 0)
  if (rows !== cols) {
    throw new TrackGridError(
      `rows count ${rows} cells and columns count ${cols}; one line cannot disagree with itself`,
    )
  }
  if (grid.givens.length !== grid.cellCount) {
    throw new TrackGridError(
      `${grid.width}x${grid.height} holds ${grid.cellCount} cells, got ${grid.givens.length} givens`,
    )
  }
  for (const [index, piece] of grid.givens.entries()) {
    if (piece < 0 || piece > PIECE_COUNT) {
      throw new TrackGridError(
        `cell ${index} holds piece ${piece}, but pieces run 0 to ${PIECE_COUNT}`,
      )
    }
  }

  // Both ends of the line are givens, so exactly two of them face off the grid.
  // Anything else and the grid either cannot be finished or has ends in the middle
  // of the board, which no solution would explain.
  //
  // Ends, not pieces. A corner turn can leave the grid at both ends at once, and
  // counting that piece once would let a grid with three open ends through as one
  // with two — a grid with no solution at all, accepted.
  //
  // And the two have to be on different cells. One cell cannot be both of a
  // line's ends: it would be the whole line, which no solution is.
  let openEnds = 0
  grid.givens.forEach((piece, index) => {
    const here = pieceEnds(piece).filter((end) => grid.neighbour(index, end) === null).length
    if (here > 1) {
      throw new TrackGridError(
        `cell ${index} runs off the grid at both ends, but a line's two ends are two cells`,
      )
    }
    openEnds += here
  })
  if (openEnds !== LINE_ENDS) {
    throw new TrackGridError(
      `${openEnds} given ends run off the grid, but a line has exactly 2 ends`,
    )
  }
  if (grid.total < LINE_ENDS) {
    throw new TrackGridError('a line needs at least its two end cells')
  }
}
