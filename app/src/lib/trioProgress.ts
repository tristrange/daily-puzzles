/** Daily attempts and the original preview snapshots use separate storage. */
import { isTrioSolved, isTrioValue, type TrioBoard, type TrioGame } from '../domain/trio'

const key = (board: TrioBoard, daily: boolean) => `daily-puzzles.${daily ? 'trio' : 'trio-preview'}.v1.${board.id}`
const fingerprint = (board: TrioBoard) => JSON.stringify([board.givens, board.relations])

export function readTrioProgress(board: TrioBoard, daily = false): { game: TrioGame; elapsedMs: number; hints?: number } | null {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key(board, daily)) ?? 'null')
    if (!raw || typeof raw !== 'object') return null
    const saved = raw as Record<string, unknown>
    const cells = saved['cells'], notes = saved['notes'], elapsedMs = saved['elapsedMs'], hints = saved['hints']
    if (daily && (typeof hints !== 'number' || !Number.isSafeInteger(hints) || hints < 0)) return null
    if (saved['version'] !== 1 || saved['board'] !== fingerprint(board)
      || typeof elapsedMs !== 'number' || !Number.isSafeInteger(elapsedMs) || elapsedMs < 0
      || !Array.isArray(cells) || cells.length !== 81 || !cells.every(isTrioValue)
      || cells.some((v, i) => board.givens[i] !== 0 && v !== board.givens[i])
      || !Array.isArray(notes) || notes.length !== 81
      || !notes.every((v: unknown, i) => typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 7 && (cells[i] === 0 || v === 0))
      || isTrioSolved(board, cells)) return null
    return { game: { cells: [...cells], notes: [...notes] as number[] }, elapsedMs, ...(daily ? { hints: hints as number } : {}) }
  } catch { return null }
}

export function storeTrioProgress(board: TrioBoard, game: TrioGame, elapsedMs: number, daily = false, hints = 0): boolean {
  if (!Number.isSafeInteger(elapsedMs) || elapsedMs < 0 || !Number.isSafeInteger(hints) || hints < 0) return false
  try {
    if (isTrioSolved(board, game.cells)) localStorage.removeItem(key(board, daily))
    else localStorage.setItem(key(board, daily), JSON.stringify({ version: 1, board: fingerprint(board), ...game, elapsedMs, ...(daily ? { hints } : {}) }))
    return true
  } catch { return false }
}
