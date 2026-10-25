import { attemptTime, validPlayTime, type PlayTime } from './playTime'
/** Word Paths attempts; preview and daily records never share a key. */
import { puzzleTypeOf } from '../domain/dates'
import { createWordGame, isWordSolved, spellPath, submitWord, type WordGame } from '../domain/wordGame'
import type { WordGrid } from '../domain/wordPaths'

const key = (id: string, preview: boolean, version: 1 | 2 = 1) => `daily-puzzles.word-progress.${preview ? 'preview.' : ''}${id}${version === 1 ? '' : '.v2'}`
const fingerprint = (grid: WordGrid) => JSON.stringify([grid.width, grid.height, grid.letters, grid.wordLengths])

export function readWordProgress(id: string, grid: WordGrid, preview = false): { game: WordGame; elapsedMs: number; attemptElapsedMs?: number; hints: number } | null {
  if (puzzleTypeOf(id) !== 'word-paths') return null
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key(id, preview, grid.vocabularyVersion)) ?? 'null')
    if (raw === null || typeof raw !== 'object') return null
    const data = raw as Record<string, unknown>
    const elapsedMs = data['elapsedMs']
    const hints = data['hints'] === undefined ? 0 : data['hints']
    if (typeof hints !== 'number' || !Number.isSafeInteger(hints) || hints < 0) return null
    if (data['version'] !== 1 || data['board'] !== fingerprint(grid)
      || typeof elapsedMs !== 'number' || !Number.isSafeInteger(elapsedMs) || elapsedMs < 0) return null
    const paths = data['words']
    const trace = data['trace']
    if (!Array.isArray(paths) || paths.length > grid.wordLengths.length || !Array.isArray(trace)) return null
    const cells = (path: unknown): path is number[] => Array.isArray(path)
      && path.length <= grid.cellCount && path.every((cell: unknown) => typeof cell === 'number' && Number.isInteger(cell))
    let game = createWordGame(grid)
    for (const path of paths as unknown[]) {
      if (!cells(path)) return null
      const result = submitWord({ ...game, trace: path })
      if (!result.accepted) return null
      game = result.game
    }
    if (!cells(trace)) return null
    if (trace.length > 0) spellPath(grid, trace)
    if (game.words.some((path) => path.some((cell) => trace.includes(cell)))) return null
    if (isWordSolved(game)) {
      clearWordProgress(id, preview, grid.vocabularyVersion)
      return null
    }
    return { game: { ...game, trace }, elapsedMs, ...attemptTime(data['attemptElapsedMs'], elapsedMs), hints }
  } catch { return null }
}

export function storeWordProgress(id: string, game: WordGame, time: PlayTime, preview = false, hints = 0): boolean {
  if (puzzleTypeOf(id) !== 'word-paths' || !validPlayTime(time)
    || !Number.isSafeInteger(hints) || hints < 0) return false
  if (isWordSolved(game)) {
    clearWordProgress(id, preview, game.grid.vocabularyVersion)
    return true
  }
  try {
    localStorage.setItem(key(id, preview, game.grid.vocabularyVersion), JSON.stringify({
      version: 1, board: fingerprint(game.grid), words: game.words, trace: game.trace, ...time, hints,
    }))
    return true
  } catch { return false }
}

export function clearWordProgress(id: string, preview = false, version: 1 | 2 = 1): void {
  try { localStorage.removeItem(key(id, preview, version)) } catch { /* Play remains usable without storage. */ }
}
