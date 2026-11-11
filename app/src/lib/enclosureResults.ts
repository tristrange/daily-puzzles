import { EnclosureGrid, enclosureFingerprint, evaluate } from '../domain/enclosure'
import type { SolveRecord } from './stats'

export type EnclosureBest = { readonly score: number; readonly walls: readonly number[]; readonly board: string; readonly achievedAt: number }

/** Decode and validate a result using only its self-contained board fingerprint. */
export function parseEnclosureBest(value: unknown): EnclosureBest | null {
  if (typeof value !== 'object' || value === null) return null
  const entry = value as Record<string, unknown>
  const { score, walls, board, achievedAt } = entry
  if (typeof score !== 'number' || !Number.isSafeInteger(score) || score < 1 ||
      typeof achievedAt !== 'number' || !Number.isSafeInteger(achievedAt) || achievedAt < 0 ||
      typeof board !== 'string' || !Array.isArray(walls) || !walls.every((wall: unknown) => typeof wall === 'number')) return null
  try {
    const parts: unknown = JSON.parse(board)
    if (!Array.isArray(parts) || parts.length !== 5) return null
    const grid = new EnclosureGrid(parts[0], parts[1], parts[2], parts[3], parts[4])
    if (enclosureFingerprint(grid) !== board) return null
    const result = evaluate(grid, walls)
    if (result.escaped || result.score !== score) return null
    return { score, walls: [...walls], board, achievedAt }
  } catch { return null }
}

/** Normalize each board separately until the current puzzle is available. */
export function enclosureBestFields(values: readonly unknown[]): Pick<SolveRecord, 'enclosureBest' | 'enclosureAlternatives'> {
  const byBoard = new Map<string, EnclosureBest>()
  for (const value of values) {
    const candidate = parseEnclosureBest(value)
    if (candidate === null) continue
    const best = betterEnclosureBest(byBoard.get(candidate.board), candidate)
    if (best) byBoard.set(candidate.board, best)
  }
  const ordered = [...byBoard.values()].sort((a, b) => a.board < b.board ? -1 : a.board > b.board ? 1 : 0)
  const [enclosureBest, ...enclosureAlternatives] = ordered
  return enclosureBest ? { enclosureBest, ...(enclosureAlternatives.length ? { enclosureAlternatives } : {}) } : {}
}

export function validatedEnclosureBest(record: SolveRecord | undefined, grid: EnclosureGrid): EnclosureBest | null {
  if (record?.puzzleType !== 'enclosure') return null
  const board = enclosureFingerprint(grid)
  const fields = enclosureBestFields([record.enclosureBest, ...(record.enclosureAlternatives ?? [])])
  return [fields.enclosureBest, ...(fields.enclosureAlternatives ?? [])].find(best => best?.board === board) ?? null
}

export function betterEnclosureBest(a: EnclosureBest | undefined, b: EnclosureBest | undefined): EnclosureBest | undefined {
  if (!a) return b
  if (!b) return a
  if (a.score !== b.score) return a.score > b.score ? a : b
  if (a.walls.length !== b.walls.length) return a.walls.length < b.walls.length ? a : b
  for (let i = 0; i < a.walls.length; i++) {
    const difference = (a.walls[i] ?? 0) - (b.walls[i] ?? 0)
    if (difference !== 0) return difference < 0 ? a : b
  }
  if (a.achievedAt !== b.achievedAt) return a.achievedAt < b.achievedAt ? a : b
  return a.board <= b.board ? a : b
}
