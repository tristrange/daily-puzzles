import { attemptTime, validPlayTime, type PlayTime } from './playTime'
import { isTentsMark, isTentsSolved, type TentsBoard, type TentsGame } from '../domain/tents'

const key = (board: TentsBoard, daily: boolean) => `daily-puzzles.${daily ? 'tents' : 'tents-preview'}.v1.${board.id}`
const fingerprint = (board: TentsBoard) => JSON.stringify([board.size, board.trees, board.rowClues, board.colClues])
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

export function readTentsProgress(board: TentsBoard, daily = false): { game: TentsGame; elapsedMs: number; attemptElapsedMs?: number; hints: number } | null {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key(board, daily)) ?? 'null')
    if (!raw || typeof raw !== 'object') return null
    const saved = raw as Record<string, unknown>, game = saved['game']
    if (saved['version'] !== 1 || saved['board'] !== fingerprint(board)
      || !count(saved['elapsedMs']) || !count(saved['hints']) || !Array.isArray(game)
      || game.length !== board.size ** 2 || !game.every(isTentsMark)
      || board.trees.some(cell => game[cell] !== 0) || isTentsSolved(board, game)) return null
    return { game: [...game], elapsedMs: saved['elapsedMs'], ...attemptTime(saved['attemptElapsedMs'], saved['elapsedMs']), hints: saved['hints'] }
  } catch { return null }
}

export function storeTentsProgress(board: TentsBoard, game: TentsGame, time: PlayTime, hints: number, daily = false): boolean {
  if (!validPlayTime(time) || !count(hints)) return false
  try {
    if (isTentsSolved(board, game)) localStorage.removeItem(key(board, daily))
    else localStorage.setItem(key(board, daily), JSON.stringify({ version: 1, board: fingerprint(board), game, ...time, hints }))
    return true
  } catch { return false }
}
