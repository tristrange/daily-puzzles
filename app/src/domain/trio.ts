/** Fixed-size playtest model. Daily-file registration follows human playtesting. */
export type TrioValue = 0 | 1 | 2 | 3
export type TrioSymbol = Exclude<TrioValue, 0>
export interface TrioRelation { readonly first: number; readonly second: number; readonly kind: 'same' | 'different' }
export interface TrioBoard { readonly id: string; readonly givens: readonly TrioValue[]; readonly relations: readonly TrioRelation[] }
export interface TrioGame { readonly cells: readonly TrioValue[]; readonly notes: readonly number[] }
export type TrioAction = { value: TrioValue } | { note: TrioSymbol; enabled: boolean }
export const TRIO_NAMES = ['Empty', 'Sun', 'Moon', 'Star'] as const
export const TRIO_LINES = [
  ...Array.from({ length: 9 }, (_, r) => Array.from({ length: 9 }, (_, c) => r * 9 + c)),
  ...Array.from({ length: 9 }, (_, c) => Array.from({ length: 9 }, (_, r) => r * 9 + c)),
]
export const isTrioValue = (value: unknown): value is TrioValue => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 3

export function parseTrioBoard(raw: unknown): TrioBoard {
  if (!raw || typeof raw !== 'object') throw Error('Invalid Trio board')
  const data = raw as Record<string, unknown>
  if (typeof data['id'] !== 'string' || !/^trio-preview-[1-9]\d*$/.test(data['id'])
    || !Array.isArray(data['givens']) || data['givens'].length !== 81 || !data['givens'].every(isTrioValue)
    || !Array.isArray(data['relations'])) throw Error('Invalid Trio preview data')
  const seen = new Set<string>()
  const relations: TrioRelation[] = data['relations'].map((item: unknown) => {
    if (!item || typeof item !== 'object') throw Error('Invalid Trio relation')
    const edge = item as Record<string, unknown>
    const a = edge['first'], b = edge['second'], kind = edge['kind']
    if (typeof a !== 'number' || !Number.isInteger(a) || typeof b !== 'number' || !Number.isInteger(b)
      || a < 0 || a >= b || b >= 81 || (kind !== 'same' && kind !== 'different')
      || Math.abs(Math.floor(a / 9) - Math.floor(b / 9)) + Math.abs(a % 9 - b % 9) !== 1
      || seen.has(`${a}:${b}`)) throw Error('Invalid Trio relation')
    seen.add(`${a}:${b}`)
    return { first: a, second: b, kind }
  })
  return { id: data['id'], givens: [...data['givens']], relations }
}

export function createTrioGame(board: TrioBoard): TrioGame {
  return { cells: [...board.givens], notes: Array<number>(81).fill(0) }
}

export function editTrio(board: TrioBoard, game: TrioGame, cell: number, action: TrioAction): TrioGame {
  if (!Number.isInteger(cell) || cell < 0 || cell >= 81 || board.givens[cell] !== 0) return game
  const cells = [...game.cells], notes = [...game.notes]
  if ('value' in action) {
    cells[cell] = action.value
    notes[cell] = 0
  } else {
    if (cells[cell] !== 0) return game
    const bit = 1 << (action.note - 1)
    notes[cell] = action.enabled ? notes[cell]! | bit : notes[cell]! & ~bit
  }
  return cells[cell] === game.cells[cell] && notes[cell] === game.notes[cell] ? game : { cells, notes }
}

export function trioAction(game: TrioGame, cell: number, value: TrioValue, pencil: boolean): TrioAction {
  return pencil && value !== 0
    ? { note: value, enabled: (game.notes[cell]! & (1 << (value - 1))) === 0 }
    : { value: game.cells[cell] === value ? 0 : value }
}

export function relationBroken(cells: readonly number[], edge: TrioRelation): boolean {
  return cells[edge.first] !== 0 && cells[edge.second] !== 0
    && ((cells[edge.first] === cells[edge.second]) !== (edge.kind === 'same'))
}

export function trioConflicts(board: TrioBoard, cells: readonly number[]): ReadonlySet<number> {
  const wrong = new Set<number>()
  for (const line of TRIO_LINES) {
    for (const symbol of [1, 2, 3]) {
      const occupied = line.filter((cell) => cells[cell] === symbol)
      if (occupied.length > 3) occupied.forEach((cell) => wrong.add(cell))
    }
    for (let i = 0; i < 7; i++) {
      const group = line.slice(i, i + 3)
      if (cells[group[0]!] !== 0 && group.every((cell) => cells[cell] === cells[group[0]!])) group.forEach((cell) => wrong.add(cell))
    }
  }
  for (const edge of board.relations) if (relationBroken(cells, edge)) { wrong.add(edge.first); wrong.add(edge.second) }
  return wrong
}

export function isTrioSolved(board: TrioBoard, cells: readonly number[]): boolean {
  return cells.length === 81 && cells.every((v, i) => isTrioValue(v) && v !== 0 && (!board.givens[i] || board.givens[i] === v))
    && trioConflicts(board, cells).size === 0
}
