import { enclosureFingerprint, evaluate, type EnclosureGame, type EnclosureGrid } from '../domain/enclosure'
import { puzzleTypeOf } from '../domain/dates'
import { parseEnclosureBest, type EnclosureBest } from './enclosureResults'
import { attemptTime, validPlayTime, type PlayTime } from './playTime'

const key = (id: string) => `daily-puzzles.enclosure-progress.${id}`

export function readEnclosureProgress(id: string, grid: EnclosureGrid): { game: EnclosureGame; elapsedMs: number; attemptElapsedMs?: number; previewBest?: EnclosureBest } | null {
  if (puzzleTypeOf(id) !== 'enclosure') return null
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key(id)) ?? 'null')
    if (typeof value !== 'object' || value === null) return null
    const data = value as Record<string, unknown>
    if (data['version'] !== 1 || data['board'] !== enclosureFingerprint(grid) ||
        typeof data['elapsedMs'] !== 'number' || !validPlayTime({ elapsedMs: data['elapsedMs'] }) ||
        !Array.isArray(data['walls']) || !data['walls'].every((wall: unknown) => typeof wall === 'number')) return null
    evaluate(grid, data['walls'])
    const previewBest = parseEnclosureBest(data['previewBest'])
    return { game: { grid, walls: [...data['walls']] }, elapsedMs: data['elapsedMs'], ...attemptTime(data['attemptElapsedMs'], data['elapsedMs']),
      ...(previewBest?.board === enclosureFingerprint(grid) ? { previewBest } : {}) }
  } catch { return null }
}

export function storeEnclosureProgress(id: string, game: EnclosureGame, time: PlayTime, previewBest?: EnclosureBest): boolean {
  if (puzzleTypeOf(id) !== 'enclosure' || !validPlayTime(time)) return false
  try {
    evaluate(game.grid, game.walls)
    const validBest = previewBest ? parseEnclosureBest(previewBest) : null
    if (previewBest && (!validBest || validBest.board !== enclosureFingerprint(game.grid))) return false
    localStorage.setItem(key(id), JSON.stringify({ version: 1, board: enclosureFingerprint(game.grid), walls: game.walls, ...time, ...(validBest ? { previewBest: validBest } : {}) }))
    return true
  } catch { return false }
}

export function clearEnclosureProgress(id: string): void {
  try { localStorage.removeItem(key(id)) } catch { /* Storage may be unavailable. */ }
}
