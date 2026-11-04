import { PUZZLE_TYPES } from '../domain/board'
import { isPuzzleId, puzzleIdFor, puzzleIdsForDay } from '../domain/dates'
import type { DifficultyBand } from '../domain/puzzle'
import { downloadedPuzzleIds, probePuzzles, readDownloadedPuzzle, type Fetcher, type PublishedPuzzle } from './puzzles'

const INDEX_URL = `${import.meta.env.BASE_URL}archive-index.json`
const INDEX_CACHE = `daily-puzzles.archive-index:${import.meta.env.BASE_URL}:v1`
const BANDS: readonly DifficultyBand[] = [1, 2, 3, 4, 5]
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const dimension = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 16

export function parseArchiveIndex(value: unknown): readonly PublishedPuzzle[] | null {
  if (!object(value) || value['version'] !== 1 || !Array.isArray(value['puzzles'])) return null
  const puzzles: PublishedPuzzle[] = [], seen = new Set<string>()
  for (const raw of value['puzzles']) {
    if (!object(raw) || typeof raw['id'] !== 'string' || !isPuzzleId(raw['id']) || seen.has(raw['id'])) return null
    const type = PUZZLE_TYPES.find(candidate => candidate === raw['type'])
    const difficulty = raw['difficulty'] === null ? null : BANDS.find(band => band === raw['difficulty'])
    if (!type || difficulty === undefined || !dimension(raw['width']) || !dimension(raw['height'])) return null
    seen.add(raw['id'])
    puzzles.push({ id: raw['id'], type, difficulty, width: raw['width'], height: raw['height'] })
  }
  return puzzles
}

async function parsed(response: Response): Promise<readonly PublishedPuzzle[] | null> {
  if (!response.ok) return null
  try { return parseArchiveIndex(await response.clone().json()) } catch { return null }
}

/** A fresh index when online, then the last saved index plus any newer offline puzzles. */
export async function loadArchiveIndex(fetcher: Fetcher = url => fetch(url, { cache: 'no-store' })): Promise<readonly PublishedPuzzle[] | null> {
  try {
    const response = await fetcher(INDEX_URL), index = await parsed(response)
    if (index) {
      try { await (await caches.open(INDEX_CACHE)).put(INDEX_URL, response) } catch { /* Browsing still works online. */ }
      return index
    }
  } catch { /* Try the saved copy. */ }
  let saved: readonly PublishedPuzzle[] | null = null
  try {
    const response = await (await caches.open(INDEX_CACHE)).match(INDEX_URL)
    if (response) saved = await parsed(response)
  } catch { /* Cache may be unavailable. */ }
  if (!saved) return null
  const known = new Set(saved.map(puzzle => puzzle.id))
  const extra = await Promise.all((await downloadedPuzzleIds()).filter(id => !known.has(id)).map(readDownloadedPuzzle))
  return [...saved, ...extra.flatMap(puzzle => puzzle ? [{ id: puzzle.id, type: puzzle.puzzleType, difficulty: puzzle.difficulty,
    width: puzzle.board.width, height: puzzle.board.height }] : [])]
}

/** Fetch and save all boards in the window, as the archive has always done. */
export async function loadIndexedWindow(days: readonly string[], index: readonly PublishedPuzzle[], fetcher: Fetcher = fetch): Promise<readonly PublishedPuzzle[]> {
  const metadata = new Map(index.map(puzzle => [puzzle.id, puzzle]))
  const ids = days.flatMap(day => [...new Set([...puzzleIdsForDay(day), puzzleIdFor(day, 'train-tracks')])])
    .filter(id => metadata.has(id))
  const probes = await probePuzzles(ids, fetcher)
  return probes.flatMap(({ puzzle }) => puzzle
    ? [{ id: puzzle.id, type: puzzle.puzzleType, difficulty: puzzle.difficulty, width: puzzle.board.width, height: puzzle.board.height }] : [])
}
