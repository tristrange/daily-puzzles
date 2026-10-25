import { attemptTime, validPlayTime, type PlayTime } from './playTime'
/** Preview and daily attempts have separate storage namespaces. */
import { puzzleTypeOf } from '../domain/dates'
import { sudokuVariantOf } from '../domain/sudokuLevels'
import { isSudokuSolved, sudokuDigit, type SudokuBoard, type SudokuGame } from '../domain/sudoku'
const key = (board: SudokuBoard, daily: boolean) => `daily-puzzles.${daily ? 'sudoku' : 'sudoku-preview'}.v1.${board.id}`
const fingerprint = (board: SudokuBoard) => JSON.stringify([board.level, board.givens])
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

export function readSudokuProgress(board: SudokuBoard, daily = false): { game: SudokuGame; elapsedMs: number; attemptElapsedMs?: number; hints: number } | null {
  if (daily && (puzzleTypeOf(board.id) !== 'sudoku' || sudokuVariantOf(board.id)?.name !== board.level)) return null
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key(board, daily)) ?? 'null')
    if (!raw || typeof raw !== 'object') return null
    const data = raw as Record<string, unknown>, cells = data['cells'], notes = data['notes']
    if (data['version'] !== 1 || data['board'] !== fingerprint(board) || !count(data['elapsedMs']) || !count(data['hints'])
      || !Array.isArray(cells) || cells.length !== 81 || !cells.every(sudokuDigit)
      || cells.some((value, cell) => board.givens[cell] !== 0 && board.givens[cell] !== value)
      || !Array.isArray(notes) || notes.length !== 81 || !notes.every((value: unknown, cell) => count(value) && value <= 511 && (cells[cell] === 0 || value === 0))
      || isSudokuSolved(board, cells)) return null
    return { game: { cells: [...cells], notes: [...notes] as number[] }, elapsedMs: data['elapsedMs'], ...attemptTime(data['attemptElapsedMs'], data['elapsedMs']), hints: data['hints'] }
  } catch { return null }
}

export function storeSudokuProgress(board: SudokuBoard, game: SudokuGame, time: PlayTime, hints: number, daily = false): boolean {
  if (daily && (puzzleTypeOf(board.id) !== 'sudoku' || sudokuVariantOf(board.id)?.name !== board.level)) return false
  if (!validPlayTime(time) || !count(hints)) return false
  try {
    if (isSudokuSolved(board, game.cells)) localStorage.removeItem(key(board, daily))
    else localStorage.setItem(key(board, daily), JSON.stringify({ version: 1, board: fingerprint(board), ...game, ...time, hints }))
    return true
  } catch { return false }
}
