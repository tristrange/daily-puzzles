/** Preview-only snapshots. The daily stats store is never involved. */
import { isTrioSolved, isTrioValue, type TrioBoard, type TrioGame } from '../domain/trio'

const key = (board: TrioBoard) => `daily-puzzles.trio-preview.v1.${board.id}`
const fingerprint = (board: TrioBoard) => JSON.stringify([board.givens, board.relations])

export function readTrioProgress(board: TrioBoard): { game: TrioGame; elapsedMs: number } | null {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key(board)) ?? 'null')
    if (!raw || typeof raw !== 'object') return null
    const saved = raw as Record<string, unknown>
    const cells = saved['cells'], notes = saved['notes'], elapsedMs = saved['elapsedMs']
    if (saved['version'] !== 1 || saved['board'] !== fingerprint(board)
      || typeof elapsedMs !== 'number' || !Number.isSafeInteger(elapsedMs) || elapsedMs < 0
      || !Array.isArray(cells) || cells.length !== 81 || !cells.every(isTrioValue)
      || cells.some((v, i) => board.givens[i] !== 0 && v !== board.givens[i])
      || !Array.isArray(notes) || notes.length !== 81
      || !notes.every((v: unknown, i) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 7 && (cells[i] === 0 || v === 0))
      || isTrioSolved(board, cells)) return null
    return { game: { cells: [...cells], notes: [...notes] as number[] }, elapsedMs }
  } catch { return null }
}

export function storeTrioProgress(board: TrioBoard, game: TrioGame, elapsedMs: number): boolean {
  if (!Number.isSafeInteger(elapsedMs) || elapsedMs < 0) return false
  try {
    if (isTrioSolved(board, game.cells)) localStorage.removeItem(key(board))
    else localStorage.setItem(key(board), JSON.stringify({ version: 1, board: fingerprint(board), ...game, elapsedMs }))
    return true
  } catch { return false }
}
