/** Unfinished Train Tracks boards, isolated by full puzzle ID. */
import { puzzleTypeOf } from '../domain/dates'
import type { TrackGrid } from '../domain/tracks'
import { isTracksSolved, MAYBE, type TracksGame } from '../domain/tracksGame'

export type TrackProgress = { readonly game: TracksGame; readonly elapsedMs: number }

function key(id: string): string {
  return `daily-puzzles.track-progress.${id}`
}

function fingerprint(grid: TrackGrid): string {
  return JSON.stringify([grid.width, grid.height, grid.rowClues, grid.colClues, grid.givens])
}

export function readTrackProgress(id: string, grid: TrackGrid): TrackProgress | null {
  if (puzzleTypeOf(id) !== 'train-tracks') return null
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key(id)) ?? 'null')
    if (value === null || typeof value !== 'object') return null
    const snapshot = value as Record<string, unknown>
    const { pieces, elapsedMs } = snapshot
    if (snapshot['version'] !== 1 || snapshot['board'] !== fingerprint(grid)) return null
    if (typeof elapsedMs !== 'number' || !Number.isSafeInteger(elapsedMs) || elapsedMs < 0) return null
    if (!Array.isArray(pieces) || pieces.length !== grid.cellCount) return null
    if (!pieces.every((piece: unknown) =>
      typeof piece === 'number' && Number.isInteger(piece) && piece >= 0 && piece <= MAYBE,
    )) return null
    if (grid.givens.some((given, cell) => given !== 0 && pieces[cell] !== given)) return null
    const game: TracksGame = { grid, pieces: pieces as number[] }
    if (isTracksSolved(game)) {
      clearTrackProgress(id)
      return null
    }
    return { game, elapsedMs }
  } catch {
    return null
  }
}

export function storeTrackProgress(id: string, game: TracksGame, elapsedMs: number): boolean {
  if (puzzleTypeOf(id) !== 'train-tracks' || !Number.isSafeInteger(elapsedMs) || elapsedMs < 0) return false
  if (isTracksSolved(game)) {
    clearTrackProgress(id)
    return true
  }
  try {
    localStorage.setItem(key(id), JSON.stringify({
      version: 1, board: fingerprint(game.grid), pieces: game.pieces, elapsedMs,
    }))
    return true
  } catch {
    return false
  }
}

export function clearTrackProgress(id: string): void {
  try {
    localStorage.removeItem(key(id))
  } catch {
    // Storage may be unavailable; gameplay and solve detection still work.
  }
}
