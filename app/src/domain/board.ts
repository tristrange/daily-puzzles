/**
 * Board geometry, plus the structural guarantees every puzzle board must satisfy.
 *
 * This mirrors `engine/src/queens_engine/board.py` rule for rule. Both sides are pinned by
 * the shared `conformance/` suites, so a divergence here fails CI rather than shipping.
 */

const MIN_SIZE = 2
const MAX_SIZE = 16

export const PUZZLE_TYPES = ['queens', 'star-battle'] as const
export type PuzzleType = (typeof PUZZLE_TYPES)[number]

export class BoardError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BoardError'
  }
}

export class Board {
  readonly size: number
  readonly regions: readonly number[]
  readonly regionCapacity: readonly number[]
  readonly puzzleType: PuzzleType
  readonly cellCount: number
  readonly regionCount: number

  constructor(
    size: number,
    regions: readonly number[],
    regionCapacity: readonly number[],
    puzzleType: PuzzleType,
  ) {
    this.size = size
    this.regions = regions
    this.regionCapacity = regionCapacity
    this.puzzleType = puzzleType
    this.cellCount = this.width * this.height
    this.regionCount = regionCapacity.length
    validateBoard(this)
  }

  /**
   * The grid's width, in cells.
   *
   * Equal to `size`, and that is the point: it is the name a rectangular grid would
   * use, so a third game that is not square can adopt the same vocabulary without
   * every caller having to know which board it holds. `Board` stays square-only —
   * see `validateBoard` — and a Train Tracks board is a different class implementing
   * the same concepts, not a wider `Board`.
   */
  get width(): number {
    return this.size
  }

  /** The grid's height, in cells. See `width`. */
  get height(): number {
    return this.size
  }

  index(row: number, col: number): number {
    return row * this.width + col
  }

  coords(index: number): { row: number; col: number } {
    return { row: Math.floor(index / this.width), col: index % this.width }
  }

  regionAt(index: number): number {
    const region = this.regions[index]
    if (region === undefined) {
      throw new BoardError(`cell index ${index} out of range`)
    }
    return region
  }

  cellsOfRegion(regionId: number): number[] {
    const cells: number[] = []
    this.regions.forEach((region, index) => {
      if (region === regionId) cells.push(index)
    })
    return cells
  }

  orthogonalNeighbours(index: number): number[] {
    return this.neighbours(index, [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ])
  }

  diagonalNeighbours(index: number): number[] {
    return this.neighbours(index, [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ])
  }

  private neighbours(index: number, deltas: readonly (readonly [number, number])[]): number[] {
    const { row, col } = this.coords(index)
    const found: number[] = []
    for (const [dRow, dCol] of deltas) {
      const nextRow = row + dRow
      const nextCol = col + dCol
      if (nextRow >= 0 && nextRow < this.height && nextCol >= 0 && nextCol < this.width) {
        found.push(nextRow * this.width + nextCol)
      }
    }
    return found
  }
}

export function validateBoard(board: Board): void {
  if (board.size < MIN_SIZE || board.size > MAX_SIZE) {
    throw new BoardError(`size ${board.size} outside [${MIN_SIZE}, ${MAX_SIZE}]`)
  }

  // `width`/`height` are derived from `size`, so this cannot fail today. It is
  // here so that the square-only promise of `Board` is stated in the one place
  // that decides what a board may be, rather than implied by the two properties
  // agreeing. A future rectangular board is a separate class, and if anyone ever
  // widens this one instead, this is the line that says so out loud.
  if (board.width !== board.height) {
    throw new BoardError(`board must be square, got ${board.width}x${board.height}`)
  }

  if (board.regions.length !== board.cellCount) {
    throw new BoardError(`regions has ${board.regions.length} entries, expected ${board.cellCount}`)
  }

  if (board.regionCount < 1) {
    throw new BoardError('board must have at least one region')
  }

  const present = new Set(board.regions)
  const expected = new Set(Array.from({ length: board.regionCount }, (_, id) => id))
  if (present.size !== expected.size || [...present].some((id) => !expected.has(id))) {
    throw new BoardError('region ids must be exactly 0..regionCount-1, with no gaps')
  }

  if (board.puzzleType === 'queens') {
    if (board.regionCount !== board.size) {
      throw new BoardError(`queens needs exactly ${board.size} regions, found ${board.regionCount}`)
    }
    if (board.regionCapacity.some((capacity) => capacity !== 1)) {
      throw new BoardError('queens requires a capacity of exactly 1 per region')
    }
  }

  if (board.puzzleType === 'star-battle') {
    if (board.regionCount !== board.size) {
      throw new BoardError(
        `star battle needs exactly ${board.size} regions, found ${board.regionCount}`,
      )
    }
    if (board.regionCapacity.some((capacity) => capacity !== board.regionCapacity[0])) {
      throw new BoardError('star battle requires one capacity shared by every region')
    }
  }

  for (let regionId = 0; regionId < board.regionCount; regionId += 1) {
    const cells = board.cellsOfRegion(regionId)
    const capacity = board.regionCapacity[regionId] ?? 0
    if (capacity < 1 || capacity > cells.length) {
      throw new BoardError(
        `region ${regionId} capacity ${capacity} outside [1, ${cells.length}]`,
      )
    }
    if (!isOrthogonallyConnected(board, cells)) {
      throw new BoardError(`region ${regionId} is not orthogonally connected`)
    }
  }

  // Last, because it is the only rule that reads every capacity at once rather
  // than each against its own region. The regions partition the grid, so a set
  // of capacities is only playable if it totals a whole multiple of the size;
  // otherwise there is no whole number of marks per line and the game cannot
  // end. That failure is silent in a way the checks above are not: `starsPerRow`
  // divides anyway, gets a fraction, and `isSolved` asks the player for a piece
  // count the row limits make unreachable — a puzzle that can never be won and
  // never says why.
  //
  // Given the capacity check in the loop above, divisibility is the whole rule:
  // the capacities sum to at least one and at most `size * size`, so a total
  // that divides by the size lands the quotient in `1..size` on its own.
  //
  // Both genres already force a uniform capacity across exactly `size` regions,
  // so the total always divides and this can never fire for a `Board`.
  const total = board.regionCapacity.reduce((sum, capacity) => sum + capacity, 0)
  if (total % board.size !== 0) {
    throw new BoardError(
      `capacities total ${total}, which is not divisible by the grid size ${board.size}`,
    )
  }
}

// Regions are only required to be 4-connected. An earlier version also rejected
// a region that touched itself diagonally, on the theory that it would be
// ambiguous which blob was which. That rule is degenerate: a 4-connected set
// with no diagonal self-contact is necessarily a straight line, because a path
// that ever turns step p -> q -> r puts p and r diagonally adjacent. So the
// check silently reduced every puzzle to parallel stripes, rejecting the L, T
// and block shapes the genre is actually made of. Connectivity already prevents
// the ambiguity it was meant to prevent.

function isOrthogonallyConnected(board: Board, cells: readonly number[]): boolean {
  const members = new Set(cells)
  const first = cells[0]
  if (first === undefined) return false

  const seen = new Set<number>([first])
  const stack = [first]
  while (stack.length > 0) {
    const current = stack.pop()
    if (current === undefined) break
    for (const neighbour of board.orthogonalNeighbours(current)) {
      if (members.has(neighbour) && !seen.has(neighbour)) {
        seen.add(neighbour)
        stack.push(neighbour)
      }
    }
  }
  return seen.size === members.size
}
