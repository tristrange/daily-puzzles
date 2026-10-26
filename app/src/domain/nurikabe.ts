export interface NurikabeBoard {
  readonly id: string
  readonly size: number
  readonly clues: readonly number[]
}
export type NurikabeMark = 0 | 1 | 2
export type NurikabeGame = readonly NurikabeMark[]
export const NURIKABE_NAMES = ['Unmarked', 'Sea', 'Land'] as const
export const isNurikabeMark = (value: unknown): value is NurikabeMark => value === 0 || value === 1 || value === 2

export class NurikabeGridError extends Error {
  constructor(message: string) { super(message); this.name = 'NurikabeGridError' }
}

function contents(size: unknown, clues: unknown): Omit<NurikabeBoard, 'id'> {
  if (typeof size !== 'number' || !Number.isInteger(size) || size < 2 || size > 10
    || !Array.isArray(clues) || clues.length !== size ** 2
    || !Array.from(clues).every((clue: unknown): clue is number => typeof clue === 'number' && Number.isInteger(clue) && clue >= 0 && clue <= size ** 2)
    || !clues.some(clue => clue > 0)) throw new NurikabeGridError('Invalid Nurikabe board data')
  return { size, clues: [...clues] }
}

export function parseNurikabeBoard(raw: unknown): NurikabeBoard {
  if (!raw || typeof raw !== 'object' || !('id' in raw) || !('size' in raw) || !('clues' in raw)
    || Object.keys(raw).some(key => !['id', 'size', 'clues'].includes(key))) throw Error('Invalid Nurikabe preview data')
  if (typeof raw.id !== 'string' || !/^nurikabe-preview-[1-9]\d*$/.test(raw.id)) throw Error('Invalid Nurikabe preview data')
  return { id: raw.id, ...contents(raw.size, raw.clues) }
}

export class NurikabeGrid implements NurikabeBoard {
  readonly size = 7
  readonly width = 7
  readonly height = 7
  readonly cellCount = 49
  readonly id: string
  readonly clues: readonly number[]

  constructor(id: string, size: unknown, clues: unknown) {
    const checked = contents(size, clues)
    if (checked.size !== 7) throw new NurikabeGridError('Daily Nurikabe requires a 7x7 grid')
    this.id = id
    this.clues = checked.clues
  }
}

export function parseNurikabeBoards(raw: unknown): readonly NurikabeBoard[] {
  if (!Array.isArray(raw) || raw.length === 0) throw Error('Invalid Nurikabe preview catalog')
  const boards = raw.map(parseNurikabeBoard)
  if (new Set(boards.map(board => board.id)).size !== boards.length) throw Error('Duplicate Nurikabe preview id')
  return boards
}

export function createNurikabeGame(board: NurikabeBoard): NurikabeGame {
  return board.clues.map(clue => clue > 0 ? 2 : 0)
}

export function isNurikabeGame(board: NurikabeBoard, game: unknown): game is NurikabeGame {
  return Array.isArray(game) && game.length === board.size ** 2 && Array.from(game).every(isNurikabeMark)
    && board.clues.every((clue, cell) => clue === 0 || game[cell] === 2)
}

export function editNurikabeCell(board: NurikabeBoard, game: NurikabeGame, cell: number, value: NurikabeMark): NurikabeGame {
  if (!Number.isInteger(cell) || cell < 0 || cell >= game.length || board.clues[cell] !== 0 || game[cell] === value) return game
  return game.map((mark, index) => index === cell ? value : mark)
}

export function nurikabeNeighbours(size: number, cell: number): number[] {
  const row = Math.floor(cell / size), col = cell % size
  return [row > 0 ? cell - size : -1, row + 1 < size ? cell + size : -1, col > 0 ? cell - 1 : -1, col + 1 < size ? cell + 1 : -1].filter(next => next >= 0)
}

function components(board: NurikabeBoard, includes: (cell: number) => boolean): number[][] {
  const seen = new Set<number>(), groups: number[][] = []
  for (let cell = 0; cell < board.size ** 2; cell++) {
    if (seen.has(cell) || !includes(cell)) continue
    const group = [cell]; seen.add(cell)
    for (const current of group) for (const next of nurikabeNeighbours(board.size, current)) {
      if (!seen.has(next) && includes(next)) { seen.add(next); group.push(next) }
    }
    groups.push(group)
  }
  return groups
}

function seaSquares(board: NurikabeBoard, game: NurikabeGame): number[] {
  const cells: number[] = []
  for (let row = 0; row < board.size - 1; row++) for (let col = 0; col < board.size - 1; col++) {
    const first = row * board.size + col, square = [first, first + 1, first + board.size, first + board.size + 1]
    if (square.every(cell => game[cell] === 1)) cells.push(...square)
  }
  return cells
}

export function nurikabeConflicts(board: NurikabeBoard, game: NurikabeGame): ReadonlySet<number> {
  const wrong = new Set(seaSquares(board, game))
  for (const land of components(board, cell => game[cell] === 2)) {
    const clues = land.filter(cell => (board.clues[cell] ?? 0) > 0)
    if (clues.length > 1 || clues.some(cell => land.length > (board.clues[cell] ?? 0))) land.forEach(cell => wrong.add(cell))
  }
  return wrong
}

export function isNurikabeSolved(board: NurikabeBoard, game: NurikabeGame): boolean {
  if (!isNurikabeGame(board, game) || seaSquares(board, game).length > 0) return false
  if (components(board, cell => game[cell] === 1).length !== 1) return false
  return components(board, cell => game[cell] !== 1).every(land => {
    const clues = land.filter(cell => (board.clues[cell] ?? 0) > 0)
    return clues.length === 1 && clues.some(cell => board.clues[cell] === land.length)
  })
}
