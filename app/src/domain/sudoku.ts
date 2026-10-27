/** Standard 9×9 Sudoku, shared by daily puzzles and isolated previews. */
export const SUDOKU_LEVELS = ['easy', 'medium', 'hard'] as const
export type SudokuLevel = typeof SUDOKU_LEVELS[number]
export interface SudokuBoard { readonly id: string; readonly level: SudokuLevel; readonly givens: readonly number[] }
export interface SudokuGame { readonly cells: readonly number[]; readonly notes: readonly number[]; readonly excludedCageCombinations?: readonly (readonly number[])[] }
export const SUDOKU_ROWS = Array.from({ length: 9 }, (_, r) => Array.from({ length: 9 }, (_, c) => r * 9 + c))
export const SUDOKU_COLUMNS = Array.from({ length: 9 }, (_, c) => Array.from({ length: 9 }, (_, r) => r * 9 + c))
export const SUDOKU_BOXES = Array.from({ length: 9 }, (_, b) => Array.from({ length: 9 }, (_, i) => (Math.floor(b / 3) * 3 + Math.floor(i / 3)) * 9 + (b % 3 * 3 + i % 3)))
export const SUDOKU_UNITS = [...SUDOKU_ROWS, ...SUDOKU_COLUMNS, ...SUDOKU_BOXES]
export const SUDOKU_PEERS = Array.from({ length: 81 }, (_, cell) => [...new Set(SUDOKU_UNITS.filter(unit => unit.includes(cell)).flat())].filter(other => other !== cell).sort((a, b) => a - b))
export const sudokuDigit = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 9
export const sudokuSingle = (mask: number) => mask > 0 && (mask & (mask - 1)) === 0
export const sudokuDigits = (mask: number) => Array.from({ length: 9 }, (_, i) => i + 1).filter(digit => mask & (1 << (digit - 1)))
export const sudokuCellName = (cell: number) => `Row ${Math.floor(cell / 9) + 1}, column ${cell % 9 + 1}`

export function sudokuConflicts(cells: readonly number[]): ReadonlySet<number> {
  const wrong = new Set<number>()
  for (const unit of SUDOKU_UNITS) for (let value = 1; value <= 9; value++) {
    const same = unit.filter(cell => cells[cell] === value)
    if (same.length > 1) same.forEach(cell => wrong.add(cell))
  }
  return wrong
}

export function parseSudokuBoards(raw: unknown): readonly SudokuBoard[] {
  if (!Array.isArray(raw) || raw.length !== 3) throw Error('Expected three Sudoku previews')
  return raw.map((item: unknown, index) => {
    if (!item || typeof item !== 'object') throw Error('Invalid Sudoku preview')
    const data = item as Record<string, unknown>, givens = data['givens'], level = SUDOKU_LEVELS[index]!
    if (Object.keys(data).sort().join(',') !== 'givens,id,level' || data['id'] !== `sudoku-preview-${index + 1}` || data['level'] !== level
      || !Array.isArray(givens) || givens.length !== 81 || !givens.every(sudokuDigit) || sudokuConflicts(givens).size) throw Error('Invalid Sudoku givens or identity')
    return { id: data['id'] as string, level, givens: [...givens] }
  })
}

export function createSudokuGame(board: SudokuBoard): SudokuGame { return { cells: [...board.givens], notes: Array<number>(81).fill(0) } }
export function editSudoku(board: SudokuBoard, game: SudokuGame, cell: number, value: number, pencil = false): SudokuGame {
  if (!Number.isInteger(cell) || cell < 0 || cell >= 81 || board.givens[cell] !== 0 || !sudokuDigit(value)) return game
  const cells = [...game.cells], notes = [...game.notes]
  if (pencil && value !== 0) {
    if (cells[cell] !== 0) return game
    notes[cell] = notes[cell]! ^ (1 << (value - 1))
  } else {
    cells[cell] = value; notes[cell] = 0
    if (value) for (const peer of SUDOKU_PEERS[cell]!) if (!cells[peer]) notes[peer]! &= ~(1 << (value - 1))
  }
  return cells[cell] === game.cells[cell] && notes.every((mask, i) => mask === game.notes[i]) ? game : { ...game, cells, notes }
}
export function isSudokuSolved(board: SudokuBoard, cells: readonly number[]): boolean {
  return cells.length === 81 && cells.every((value, cell) => sudokuDigit(value) && value !== 0 && (!board.givens[cell] || value === board.givens[cell])) && sudokuConflicts(cells).size === 0
}

export type SudokuSolution = { kind: 'unique'; cells: readonly number[] } | { kind: 'none' | 'multiple' | 'incomplete' }
export function solveSudoku(board: SudokuBoard, maxNodes = 200_000): SudokuSolution {
  if (!Number.isSafeInteger(maxNodes) || maxNodes < 0) return { kind: 'incomplete' }
  if (board.givens.length !== 81 || !board.givens.every(sudokuDigit) || sudokuConflicts(board.givens).size) return { kind: 'none' }
  const cells = [...board.givens], rows = Array<number>(9).fill(0), cols = [...rows], boxes = [...rows]
  for (const [cell, value] of cells.entries()) if (value) {
    const r = Math.floor(cell / 9), c = cell % 9, bit = 1 << (value - 1)
    rows[r]! |= bit; cols[c]! |= bit; boxes[Math.floor(r / 3) * 3 + Math.floor(c / 3)]! |= bit
  }
  const answers: number[][] = []
  let nodes = 0, exhausted = false
  const visit = () => {
    let target = -1, available = 0
    for (const [cell, value] of cells.entries()) if (!value) {
      const r = Math.floor(cell / 9), c = cell % 9
      const mask = 511 & ~(rows[r]! | cols[c]! | boxes[Math.floor(r / 3) * 3 + Math.floor(c / 3)]!)
      if (!mask) return
      if (target < 0 || sudokuDigits(mask).length < sudokuDigits(available).length) { target = cell; available = mask; if (sudokuSingle(mask)) break }
    }
    if (target < 0) { answers.push([...cells]); return }
    const r = Math.floor(target / 9), c = target % 9, box = Math.floor(r / 3) * 3 + Math.floor(c / 3)
    while (available && answers.length < 2 && !exhausted) {
      if (nodes >= maxNodes) { exhausted = true; return }
      nodes++
      const bit = available & -available
      available ^= bit; cells[target] = Math.log2(bit) + 1
      rows[r]! |= bit; cols[c]! |= bit; boxes[box]! |= bit
      visit()
      rows[r]! ^= bit; cols[c]! ^= bit; boxes[box]! ^= bit; cells[target] = 0
    }
  }
  visit()
  return exhausted ? { kind: 'incomplete' } : answers.length === 1 ? { kind: 'unique', cells: answers[0]! } : { kind: answers.length ? 'multiple' : 'none' }
}

export class SudokuGridError extends Error {}

export class SudokuGrid implements SudokuBoard {
  readonly id: string
  readonly level: SudokuLevel
  readonly givens: readonly number[]
  readonly size = 9
  readonly width = 9
  readonly height = 9
  readonly cellCount = 81
  constructor(id: string, level: unknown, givens: unknown) {
    if (!SUDOKU_LEVELS.includes(level as SudokuLevel) || !Array.isArray(givens) || givens.length !== 81
      || !givens.every(sudokuDigit) || sudokuConflicts(givens).size) throw new SudokuGridError('Invalid Sudoku givens or level')
    this.id = id; this.level = level as SudokuLevel; this.givens = [...givens]
  }
}
