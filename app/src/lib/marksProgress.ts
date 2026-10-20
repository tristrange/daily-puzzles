/**
 * Unfinished Queens and Star Battle attempts, isolated by full puzzle ID.
 *
 * The board and move state are local; a reload should not discard them. A
 * version and a board fingerprint mean a republished puzzle with the same date
 * cannot resume onto a different board. Hints and elapsed time travel with the
 * board because they are part of the result the attempt will eventually record.
 *
 * Undo history is deliberately not saved. It is a visit-local editing aid, and
 * replaying a whole stack after a reload would be a larger, easier-to-corrupt
 * snapshot for no playing benefit.
 */

import { puzzleTypeOf } from '../domain/dates'
import type { Board } from '../domain/board'
import { isSolved, type GameState } from '../domain/game'

export type MarksProgress = {
  readonly game: GameState
  readonly elapsedMs: number
  readonly hints: number
}

function key(id: string): string {
  return `daily-puzzles.marks-progress.${id}`
}

function fingerprint(board: Board): string {
  return JSON.stringify([board.puzzleType, board.size, board.regions, board.regionCapacity])
}

function cells(value: unknown, cellCount: number): ReadonlySet<number> | null {
  if (!Array.isArray(value)) return null
  const found = new Set<number>()
  for (const cell of value) {
    if (typeof cell !== 'number' || !Number.isInteger(cell) || cell < 0 || cell >= cellCount
      || found.has(cell)) return null
    found.add(cell)
  }
  return found
}

export function readMarksProgress(id: string, board: Board): MarksProgress | null {
  const type = puzzleTypeOf(id)
  if ((type !== 'queens' && type !== 'star-battle') || board.puzzleType !== type) return null
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key(id)) ?? 'null')
    if (raw === null || typeof raw !== 'object') return null
    const saved = raw as Record<string, unknown>
    const hints = saved['hints'] === undefined ? 0 : saved['hints']
    if (typeof hints !== 'number' || !Number.isSafeInteger(hints) || hints < 0) return null
    if (saved['version'] !== 1 || saved['board'] !== fingerprint(board)) return null
    const elapsedMs = saved['elapsedMs']
    if (typeof elapsedMs !== 'number' || !Number.isSafeInteger(elapsedMs) || elapsedMs < 0) return null
    const queens = cells(saved['queens'], board.cellCount)
    const marks = cells(saved['marks'], board.cellCount)
    if (queens === null || marks === null) return null
    for (const cell of queens) if (marks.has(cell)) return null
    const game: GameState = { board, queens, marks }
    if (isSolved(game)) {
      clearMarksProgress(id)
      return null
    }
    return { game, elapsedMs, hints }
  } catch {
    return null
  }
}

export function storeMarksProgress(id: string, game: GameState, elapsedMs: number, hints = 0): boolean {
  const type = puzzleTypeOf(id)
  if ((type !== 'queens' && type !== 'star-battle') || game.board.puzzleType !== type
    || !Number.isSafeInteger(elapsedMs) || elapsedMs < 0
    || !Number.isSafeInteger(hints) || hints < 0) return false
  if (isSolved(game)) {
    clearMarksProgress(id)
    return true
  }
  try {
    localStorage.setItem(key(id), JSON.stringify({
      version: 1,
      board: fingerprint(game.board),
      queens: [...game.queens].sort((a, b) => a - b),
      marks: [...game.marks].sort((a, b) => a - b),
      elapsedMs,
      hints,
    }))
    return true
  } catch {
    return false
  }
}

export function clearMarksProgress(id: string): void {
  try {
    localStorage.removeItem(key(id))
  } catch {
    // Storage may be unavailable; gameplay and solve detection still work.
  }
}
