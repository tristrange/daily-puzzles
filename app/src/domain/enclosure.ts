/** Pure rules for Horse Enclosure. Cell indices are row-major. */
export class EnclosureGridError extends Error {}

function integer(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
}

export class EnclosureGrid {
  readonly size: number
  readonly water: readonly number[]
  readonly horse: number
  readonly wallBudget: number
  readonly optimalScore: number | null

  constructor(size: unknown, water: unknown, horse: unknown, wallBudget: unknown, optimalScore: unknown = null) {
    if (!integer(size) || size < 1 || size > 12) throw new EnclosureGridError('invalid size')
    if (!Array.isArray(water)) throw new EnclosureGridError('invalid water')
    const input: unknown[] = water
    const cells: number[] = []
    for (const cell of input) {
      const previous = cells.at(-1)
      if (!integer(cell) || cell < 0 || cell >= size * size || (previous !== undefined && cell <= previous)) {
        throw new EnclosureGridError('invalid water')
      }
      cells.push(cell)
    }
    if (!integer(horse) || horse < 0 || horse >= size * size || cells.includes(horse)) {
      throw new EnclosureGridError('invalid horse')
    }
    if (!integer(wallBudget) || wallBudget < 0 || wallBudget >= size * size) {
      throw new EnclosureGridError('invalid wall budget')
    }
    if (optimalScore !== null && (!integer(optimalScore) || optimalScore < 1 || optimalScore > size * size - cells.length)) {
      throw new EnclosureGridError('invalid optimal score')
    }
    this.size = size
    this.water = Object.freeze(cells)
    this.horse = horse
    this.wallBudget = wallBudget
    this.optimalScore = optimalScore
    Object.freeze(this)
  }
  get width(): number { return this.size }
  get height(): number { return this.size }
  get cellCount(): number { return this.size * this.size }
}

function validateWalls(grid: EnclosureGrid, walls: readonly number[]): void {
  if (!Array.isArray(walls) || walls.length > grid.wallBudget) {
    throw new EnclosureGridError('invalid walls')
  }
  let previous = -1
  for (const cell of walls) {
    if (!integer(cell) || cell <= previous || cell >= grid.cellCount || cell === grid.horse || grid.water.includes(cell)) {
      throw new EnclosureGridError('invalid walls')
    }
    previous = cell
  }
}

export function evaluate(grid: EnclosureGrid, walls: readonly number[]): { readonly escaped: boolean; readonly reachable: readonly number[]; readonly score: number } {
  validateWalls(grid, walls)
  const blocked = new Set([...grid.water, ...walls])
  const seen = new Set([grid.horse])
  const queue = [grid.horse]
  for (let i = 0; i < queue.length; i++) {
    const cell = queue[i]
    if (cell === undefined) continue
    const row = Math.floor(cell / grid.size), col = cell % grid.size
    const adjacent: [number, number][] = [[row - 1, col], [row, col - 1], [row, col + 1], [row + 1, col]]
    for (const [r, c] of adjacent) {
      const next = r * grid.size + c
      if (r >= 0 && r < grid.size && c >= 0 && c < grid.size && !blocked.has(next) && !seen.has(next)) {
        seen.add(next)
        queue.push(next)
      }
    }
  }
  const reachable = [...seen].sort((a, b) => a - b)
  const escaped = reachable.some(cell => Math.floor(cell / grid.size) === 0 || Math.floor(cell / grid.size) === grid.size - 1 || cell % grid.size === 0 || cell % grid.size === grid.size - 1)
  return { escaped, reachable, score: escaped ? 0 : reachable.length }
}

export type EnclosureGame = { readonly grid: EnclosureGrid; readonly walls: readonly number[] }
export function createEnclosureGame(grid: EnclosureGrid): EnclosureGame { return { grid, walls: [] } }
export function toggleWall(game: EnclosureGame, cell: number): EnclosureGame {
  validateWalls(game.grid, game.walls)
  if (game.walls.includes(cell)) return { ...game, walls: game.walls.filter(wall => wall !== cell) }
  if (!integer(cell) || cell < 0 || cell >= game.grid.cellCount || cell === game.grid.horse || game.grid.water.includes(cell) || game.walls.length >= game.grid.wallBudget) {
    return game
  }
  return { ...game, walls: [...game.walls, cell].sort((a, b) => a - b) }
}
export function resetEnclosure(game: EnclosureGame): EnclosureGame {
  validateWalls(game.grid, game.walls)
  return game.walls.length === 0 ? game : { ...game, walls: [] }
}
export function enclosureFingerprint(grid: EnclosureGrid): string { return JSON.stringify([grid.size, grid.water, grid.horse, grid.wallBudget, grid.optimalScore]) }
