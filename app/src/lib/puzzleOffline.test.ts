import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import queens from '../../public/puzzles/2026-10-15.json'
import star from '../../public/puzzles/2026-10-15-star.json'
import tracks from '../../../conformance/id-cases/tracks-large.accept.json'
import wordsV1 from '../../../conformance/word-paths/2026-10-14-words.json'
import wordsV2 from '../../public/puzzles/2026-10-15-words.json'
import { listPublishedPuzzles, loadPuzzle, probePuzzles, PuzzleNotFoundError, PuzzleUnavailableError, puzzleUrl } from './puzzles'

const entries = new Map<string, Response>()
const put = vi.fn(async (url: string, response: Response) => { entries.set(url, response.clone()) })
const open = vi.fn(async () => ({
  match: async (url: string) => entries.get(url)?.clone(),
  put,
}))
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
const offline = async (): Promise<Response> => { throw new TypeError('Failed to fetch') }

beforeEach(() => {
  entries.clear()
  vi.clearAllMocks()
  vi.stubGlobal('caches', { open })
})
afterEach(() => vi.unstubAllGlobals())

it('lists only the selected game from saved puzzles when offline', async () => {
  for (const puzzle of [queens, star, wordsV2]) await loadPuzzle(puzzle.id, async () => json(puzzle))
  const found = await listPublishedPuzzles('2026-10-15', offline, 'word-paths')
  expect(found.map(puzzle => puzzle.id)).toEqual([wordsV2.id])
})

it.each([queens, star, tracks, wordsV1, wordsV2])('saves and reopens $id offline with its original rules', async (raw) => {
  const online = await loadPuzzle(raw.id, async () => json(raw))
  expect(put).toHaveBeenCalledOnce()
  expect(open).toHaveBeenCalledWith('daily-puzzles.puzzles:/:v1')
  expect(await loadPuzzle(raw.id, offline)).toEqual(online)
})

it('uses a fresh valid response before a saved response', async () => {
  entries.set(puzzleUrl(queens.id), json({ ...queens, seed: 123 }))
  expect((await loadPuzzle(queens.id, async () => json(queens))).seed).toBe(queens.seed)
})

it.each([
  () => new Response('<html>fallback</html>'),
  () => new Response('', { status: 503 }),
  () => new Response('', { status: 404 }),
  () => new Response('', { status: 408 }),
  () => new Response('', { status: 429 }),
  () => json({ ...queens, id: '2026-10-01' }),
  () => json({ ...queens, board: {} }),
])('retains a validated download when the next response is unusable', async (response) => {
  await loadPuzzle(queens.id, async () => json(queens))
  put.mockClear()
  expect((await loadPuzzle(queens.id, async () => response())).id).toBe(queens.id)
  expect(put).not.toHaveBeenCalled()
})

it.each([
  '<html>fallback</html>',
  JSON.stringify({ ...wordsV2, generatorVersion: 99 }),
  JSON.stringify({ ...wordsV2, id: '2026-10-16-words' }),
])('revalidates saved data rather than trusting cache contents', async (body) => {
  entries.set(puzzleUrl(wordsV2.id), new Response(body))
  await expect(loadPuzzle(wordsV2.id, offline)).rejects.toBeInstanceOf(PuzzleUnavailableError)
})

it('keeps online play working when cache access is denied', async () => {
  vi.stubGlobal('caches', { open: async () => { throw new Error('denied') } })
  expect((await loadPuzzle(queens.id, async () => json(queens))).id).toBe(queens.id)
})

it('keeps online play working when cache writes exceed quota', async () => {
  vi.stubGlobal('caches', { open: async () => ({ put: async () => { throw new Error('quota') } }) })
  expect((await loadPuzzle(queens.id, async () => json(queens))).id).toBe(queens.id)
})

it('reports cached and unavailable slots independently', async () => {
  await loadPuzzle(queens.id, async () => json(queens))
  const results = await probePuzzles([queens.id, star.id], offline)
  expect(results[0]?.puzzle?.id).toBe(queens.id)
  expect(results[1]).toEqual({ id: star.id, puzzle: null, unavailable: true })
})


it('does not replace a saved Word Paths board with an unsupported version', async () => {
  await loadPuzzle(wordsV2.id, async () => json(wordsV2))
  put.mockClear()
  expect((await loadPuzzle(wordsV2.id, async () => json({ ...wordsV2, generatorVersion: 99 }))).generatorVersion).toBe(2)
  expect(put).not.toHaveBeenCalled()
})

it('keeps online play working without the Cache API', async () => {
  vi.stubGlobal('caches', undefined)
  expect((await loadPuzzle(queens.id, async () => json(queens))).id).toBe(queens.id)
})


it.each([403, 408, 429, 503])('reports HTTP %s as unavailable when no saved puzzle exists', async (status) => {
  const fetcher = async () => new Response('', { status })
  await expect(loadPuzzle(queens.id, fetcher)).rejects.toBeInstanceOf(PuzzleUnavailableError)
  expect(await probePuzzles([queens.id], fetcher)).toEqual([
    { id: queens.id, puzzle: null, unavailable: true },
  ])
})

it('keeps an uncached HTTP 404 absent rather than unavailable', async () => {
  const fetcher = async () => new Response('', { status: 404 })
  await expect(loadPuzzle(queens.id, fetcher)).rejects.toBeInstanceOf(PuzzleNotFoundError)
  expect(await probePuzzles([queens.id], fetcher)).toEqual([{ id: queens.id, puzzle: null }])
})
