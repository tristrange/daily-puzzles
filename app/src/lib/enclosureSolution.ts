import { EnclosureGrid, enclosureFingerprint, evaluate } from '../domain/enclosure'
import { puzzleTypeOf } from '../domain/dates'

export type EnclosureSolution = {
  readonly version: 1
  readonly id: string
  readonly board: string
  readonly walls: readonly number[]
}

type SolutionFetcher = (url: string, options?: RequestInit) => Promise<Response>
export const ENCLOSURE_SOLUTION_CACHE_CHANGED = 'daily-puzzles:enclosure-solution-cache'
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

export function parseEnclosureSolution(value: unknown, id: string, grid: EnclosureGrid): EnclosureSolution | null {
  if (!object(value) || puzzleTypeOf(id) !== 'enclosure' || grid.optimalScore === null ||
      value['version'] !== 1 || value['id'] !== id || value['board'] !== enclosureFingerprint(grid)) return null
  const walls = value['walls']
  if (!Array.isArray(walls) || !walls.every((cell: unknown): cell is number => typeof cell === 'number')) return null
  try {
    const result = evaluate(grid, walls)
    return !result.escaped && result.score === grid.optimalScore
      ? { version: 1, id, board: enclosureFingerprint(grid), walls: [...walls] } : null
  } catch { return null }
}

export function enclosureSolutionUrl(id: string): string {
  return `${import.meta.env.BASE_URL}solutions/enclosure/${id}.json`
}

export class EnclosureSolutionUnavailableError extends Error {
  constructor() {
    super('Could not load a verified optimal solution. Connect to the internet and try again.')
    this.name = 'EnclosureSolutionUnavailableError'
  }
}

async function parsed(response: Response | undefined, id: string, grid: EnclosureGrid): Promise<EnclosureSolution | null> {
  if (!response?.ok) return null
  try { return parseEnclosureSolution(await response.clone().json(), id, grid) } catch { return null }
}

function notify(id: string, saved: boolean): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(ENCLOSURE_SOLUTION_CACHE_CHANGED, { detail: { id, saved } }))
}

export async function readCachedEnclosureSolution(id: string, grid: EnclosureGrid): Promise<EnclosureSolution | null> {
  try {
    if (typeof caches === 'undefined') return null
    const storage = await caches.open(`daily-puzzles.enclosure-solutions:${import.meta.env.BASE_URL}:v1`)
    return parsed(await storage.match(enclosureSolutionUrl(id)), id, grid)
  } catch { return null }
}

/** A validated witness is immutable for its board, so an offline copy is sufficient. */
export async function loadEnclosureSolution(id: string, grid: EnclosureGrid, fetcher: SolutionFetcher = fetch): Promise<EnclosureSolution> {
  if (puzzleTypeOf(id) !== 'enclosure' || grid.optimalScore === null) throw new EnclosureSolutionUnavailableError()
  const url = enclosureSolutionUrl(id)
  let storage: Cache | null = null
  try {
    if (typeof caches !== 'undefined') {
      storage = await caches.open(`daily-puzzles.enclosure-solutions:${import.meta.env.BASE_URL}:v1`)
      const cached = await parsed(await storage.match(url), id, grid)
      if (cached) { notify(id, true); return cached }
    }
  } catch { /* Online reveal remains available when storage is blocked. */ }
  try {
    const response = await fetcher(url, { signal: AbortSignal.timeout(8_000) })
    const solution = await parsed(response, id, grid)
    if (solution) {
      let saved = false
      try { if (storage) { await storage.put(url, response); saved = true } } catch { /* The fetched solution still works this visit. */ }
      notify(id, saved)
      return solution
    }
  } catch { /* Network and invalid-response failures share the retry path. */ }
  notify(id, false)
  throw new EnclosureSolutionUnavailableError()
}
