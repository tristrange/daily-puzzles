/** Preview-only Tents rules. Pairings are existential; only placements must be unique. */
export interface TentsBoard {
  readonly id: string; readonly size: 8 | 10; readonly trees: readonly number[]
  readonly rowClues: readonly number[]; readonly colClues: readonly number[]
}
export type TentsMark = 0 | 1 | 2 // Empty, tent, grass.
export type TentsGame = readonly TentsMark[]
export const TENTS_NAMES = ['Empty', 'Tent', 'Grass'] as const
export const isTentsMark = (value: unknown): value is TentsMark => value === 0 || value === 1 || value === 2

export function parseTentsBoard(raw: unknown): TentsBoard {
  if (!raw || typeof raw !== 'object') throw Error('Invalid Tents board')
  const data = raw as Record<string, unknown>
  const size = data['size']
  if (size !== 8 && size !== 10) throw Error('Invalid Tents board size')
  const trees = data['trees'], rows = data['rowClues'], cols = data['colClues']
  const clue = (values: unknown): values is number[] => Array.isArray(values) && values.length === size
    && values.every((n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= size)
  if (typeof data['id'] !== 'string' || !/^tents-preview-[1-9]\d*$/.test(data['id'])
    || !Array.isArray(trees) || !trees.length || !trees.every((cell: unknown) => typeof cell === 'number' && Number.isInteger(cell) && cell >= 0 && cell < size ** 2)
    || new Set(trees).size !== trees.length || !clue(rows) || !clue(cols)
    || rows.reduce((a, b) => a + b, 0) !== trees.length || cols.reduce((a, b) => a + b, 0) !== trees.length) throw Error('Invalid Tents preview data')
  return { id: data['id'], size, trees: [...trees] as number[], rowClues: [...rows], colClues: [...cols] }
}

export function tentsNeighbours(board: TentsBoard, cell: number, diagonal = false): number[] {
  const row = Math.floor(cell / board.size), col = cell % board.size, result: number[] = []
  for (let r = Math.max(0, row - 1); r <= Math.min(board.size - 1, row + 1); r++) {
    for (let c = Math.max(0, col - 1); c <= Math.min(board.size - 1, col + 1); c++) {
      if ((r !== row || c !== col) && (diagonal || Math.abs(r - row) + Math.abs(c - col) === 1)) result.push(r * board.size + c)
    }
  }
  return result
}

export function createTentsGame(board: TentsBoard): TentsGame { return Array<TentsMark>(board.size ** 2).fill(0) }

export function editTent(board: TentsBoard, game: TentsGame, cell: number, value: TentsMark): TentsGame {
  if (!Number.isInteger(cell) || cell < 0 || cell >= game.length || board.trees.includes(cell) || game[cell] === value) return game
  return game.map((mark, i) => i === cell ? value : mark)
}

export function hasTentsMatching(board: TentsBoard, tents: readonly number[]): boolean {
  const owner = new Map<number, number>()
  const assign = (tent: number, seen: Set<number>): boolean => {
    for (const tree of tentsNeighbours(board, tent)) {
      if (!board.trees.includes(tree) || seen.has(tree)) continue
      seen.add(tree)
      const previous = owner.get(tree)
      if (previous === undefined || assign(previous, seen)) { owner.set(tree, tent); return true }
    }
    return false
  }
  return tents.every(tent => assign(tent, new Set()))
}

export function tentsLines(board: TentsBoard): { cells: number[]; count: number; name: string }[] {
  return [
    ...board.rowClues.map((count, row) => ({ cells: Array.from({ length: board.size }, (_, col) => row * board.size + col), count, name: `Row ${row + 1}` })),
    ...board.colClues.map((count, col) => ({ cells: Array.from({ length: board.size }, (_, row) => row * board.size + col), count, name: `Column ${col + 1}` })),
  ]
}

export function tentsConflicts(board: TentsBoard, game: TentsGame): ReadonlySet<number> {
  const wrong = new Set<number>(), tents = game.flatMap((mark, cell) => mark === 1 ? [cell] : [])
  for (const cell of tents) {
    const touching = tentsNeighbours(board, cell, true).filter(other => game[other] === 1)
    if (touching.length) { wrong.add(cell); touching.forEach(other => wrong.add(other)) }
    if (board.trees.includes(cell)) wrong.add(cell)
  }
  if (!hasTentsMatching(board, tents)) tents.forEach(cell => wrong.add(cell))
  for (const line of tentsLines(board)) {
    const occupied = line.cells.filter(cell => game[cell] === 1)
    if (occupied.length > line.count) occupied.forEach(cell => wrong.add(cell))
  }
  return wrong
}

export function isTentsSolved(board: TentsBoard, game: TentsGame): boolean {
  return game.length === board.size ** 2 && game.every(isTentsMark)
    && board.trees.every(cell => game[cell] === 0)
    && tentsLines(board).every(line => line.cells.filter(cell => game[cell] === 1).length === line.count)
    && tentsConflicts(board, game).size === 0
}
