import { editSudoku, isSudokuSolved, sudokuConflicts, sudokuDigit, sudokuDigits, type SudokuBoard, type SudokuGame } from './sudoku'

export interface KillerCage { readonly sum: number; readonly cells: readonly number[] }
export interface KillerSudokuBoard extends SudokuBoard { readonly cages: readonly KillerCage[] }

/** Distinct digit sets, independent of the player's entries and notes. */
export function killerCombinations(cage: KillerCage): number[] {
  return Array.from({ length: 511 }, (_, i) => i + 1).filter(mask => {
    const digits = sudokuDigits(mask)
    return digits.length === cage.cells.length && digits.reduce((sum, digit) => sum + digit, 0) === cage.sum
  }).sort((a, b) => {
    const first = sudokuDigits(a), second = sudokuDigits(b)
    for (let i = 0; i < first.length; i++) if (first[i] !== second[i]) return first[i]! - second[i]!
    return 0
  })
}

export function isKillerSudokuBoard(board: SudokuBoard): board is KillerSudokuBoard {
  return 'cages' in board
}

/** Preview data is checked once, before it is used by the board or saved progress. */
export function parseKillerPreviews(raw: unknown): readonly KillerSudokuBoard[] {
  if (!Array.isArray(raw) || raw.length === 0) throw Error('Expected Killer Sudoku previews')
  return raw.map((item: unknown, index) => {
    if (!item || typeof item !== 'object') throw Error('Invalid Killer Sudoku preview')
    const data = item as Record<string, unknown>
    if (data['id'] !== `killer-preview-${index + 1}` || data['level'] !== 'hard'
      || !Array.isArray(data['givens']) || data['givens'].length !== 81 || !data['givens'].every(sudokuDigit)
      || sudokuConflicts(data['givens']).size || !Array.isArray(data['cages'])) throw Error('Invalid Killer Sudoku board')
    const seen = new Set<number>()
    const cages = data['cages'].map((value: unknown): KillerCage => {
      if (!value || typeof value !== 'object') throw Error('Invalid Killer Sudoku cage')
      const cage = value as Record<string, unknown>, cells = cage['cells'], sum = cage['sum']
      if (!Array.isArray(cells) || !cells.length || cells.length > 9 || !cells.every(cell => Number.isInteger(cell) && cell >= 0 && cell < 81)
        || typeof sum !== 'number' || !Number.isInteger(sum) || sum < cells.length * (cells.length + 1) / 2
        || sum > cells.length * (19 - cells.length) / 2) throw Error('Invalid Killer Sudoku cage')
      const reached = new Set<number>([cells[0]])
      let changed = true
      while (changed) {
        changed = false
        for (const cell of cells) if (!reached.has(cell) && [...reached].some(other => Math.abs(cell - other) === 9 || Math.abs(cell - other) === 1 && Math.floor(cell / 9) === Math.floor(other / 9))) { reached.add(cell); changed = true }
      }
      if (reached.size !== cells.length || cells.some(cell => seen.has(cell))) throw Error('Overlapping or disconnected Killer Sudoku cage')
      cells.forEach(cell => seen.add(cell))
      return { sum, cells: [...cells] }
    })
    if (seen.size !== 81) throw Error('Killer Sudoku cages must cover the board')
    const board: KillerSudokuBoard = { id: `killer-preview-${index + 1}`, level: 'hard', givens: [...data['givens']], cages }
    if (killerConflicts(board, board.givens).size) throw Error('Invalid Killer Sudoku givens')
    return board
  })
}

export function killerConflicts(board: KillerSudokuBoard, cells: readonly number[]): ReadonlySet<number> {
  const wrong = new Set(sudokuConflicts(cells))
  for (const cage of board.cages) {
    const filled = cage.cells.filter(cell => cells[cell])
    const values = filled.map(cell => cells[cell]!)
    const total = values.reduce((sum, value) => sum + value, 0)
    if (new Set(values).size !== values.length || total > cage.sum || (filled.length < cage.cells.length && total === cage.sum) || (filled.length === cage.cells.length && total !== cage.sum)) {
      filled.forEach(cell => wrong.add(cell))
    }
  }
  return wrong
}

export function isKillerSolved(board: KillerSudokuBoard, cells: readonly number[]): boolean {
  return isSudokuSolved(board, cells) && killerConflicts(board, cells).size === 0
}

export function editKillerSudoku(board: KillerSudokuBoard, game: SudokuGame, cell: number, value: number, pencil = false): SudokuGame {
  const next = editSudoku(board, game, cell, value, pencil)
  if (next === game || pencil || !value || next.cells[cell] !== value) return next
  const cage = board.cages.find(entry => entry.cells.includes(cell))
  if (!cage) return next
  const notes = [...next.notes]
  for (const peer of cage.cells) if (peer !== cell && !next.cells[peer]) notes[peer]! &= ~(1 << (value - 1))
  return { ...next, notes }
}
