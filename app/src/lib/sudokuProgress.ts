/** Sudoku preview snapshots are separate from every daily game and solve history. */
import { isSudokuSolved, sudokuDigit, type SudokuBoard, type SudokuGame } from '../domain/sudoku'
const key = (board: SudokuBoard) => `daily-puzzles.sudoku-preview.v1.${board.id}`
const fingerprint = (board: SudokuBoard) => JSON.stringify([board.level, board.givens])
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

export function readSudokuProgress(board: SudokuBoard): { game: SudokuGame; elapsedMs: number; hints: number } | null {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key(board)) ?? 'null')
    if (!raw || typeof raw !== 'object') return null
    const data = raw as Record<string, unknown>, cells = data['cells'], notes = data['notes']
    if (data['version'] !== 1 || data['board'] !== fingerprint(board) || !count(data['elapsedMs']) || !count(data['hints'])
      || !Array.isArray(cells) || cells.length !== 81 || !cells.every(sudokuDigit)
      || cells.some((value, cell) => board.givens[cell] !== 0 && board.givens[cell] !== value)
      || !Array.isArray(notes) || notes.length !== 81 || !notes.every((value: unknown, cell) => count(value) && value <= 511 && (cells[cell] === 0 || value === 0))
      || isSudokuSolved(board, cells)) return null
    return { game: { cells: [...cells], notes: [...notes] as number[] }, elapsedMs: data['elapsedMs'], hints: data['hints'] }
  } catch { return null }
}

export function storeSudokuProgress(board: SudokuBoard, game: SudokuGame, elapsedMs: number, hints: number): boolean {
  if (!count(elapsedMs) || !count(hints)) return false
  try {
    if (isSudokuSolved(board, game.cells)) localStorage.removeItem(key(board))
    else localStorage.setItem(key(board), JSON.stringify({ version: 1, board: fingerprint(board), ...game, elapsedMs, hints }))
    return true
  } catch { return false }
}
