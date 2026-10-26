import { attemptTime, validPlayTime, type PlayTime } from './playTime'
import { isNurikabeGame, isNurikabeSolved, type NurikabeBoard, type NurikabeGame } from '../domain/nurikabe'

const key = (board: NurikabeBoard, daily: boolean) => `daily-puzzles.${daily ? 'nurikabe' : 'nurikabe-preview'}.v1.${board.id}`
const fingerprint = (board: NurikabeBoard) => JSON.stringify([board.size, board.clues])
const validTime = (time: unknown): time is number => typeof time === 'number' && Number.isSafeInteger(time) && time >= 0

export function readNurikabeProgress(board: NurikabeBoard, daily = false): { game: NurikabeGame; elapsedMs: number; attemptElapsedMs?: number } | null {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(key(board, daily)) ?? 'null')
    if (!saved || typeof saved !== 'object' || !('version' in saved) || saved.version !== 1
      || !('board' in saved) || saved.board !== fingerprint(board) || !('elapsedMs' in saved) || !validTime(saved.elapsedMs)
      || !('game' in saved) || !isNurikabeGame(board, saved.game) || isNurikabeSolved(board, saved.game)) return null
    return { game: [...saved.game], elapsedMs: saved.elapsedMs, ...attemptTime('attemptElapsedMs' in saved ? saved.attemptElapsedMs : undefined, saved.elapsedMs) }
  } catch { return null }
}

export function storeNurikabeProgress(board: NurikabeBoard, game: NurikabeGame, time: PlayTime, daily = false): boolean {
  if (!validPlayTime(time) || !isNurikabeGame(board, game)) return false
  try {
    if (isNurikabeSolved(board, game)) localStorage.removeItem(key(board, daily))
    else localStorage.setItem(key(board, daily), JSON.stringify({ version: 1, board: fingerprint(board), game, ...time }))
    return true
  } catch { return false }
}
