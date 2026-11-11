import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import daily from '../../public/puzzles/2026-11-11-enclosure.json'
import witness from '../../public/solutions/enclosure/2026-11-11-enclosure.json'
import { isEnclosurePuzzle } from '../domain/puzzle'
import { loadPuzzle } from './puzzles'
import { enclosureSolutionUrl, loadEnclosureSolution } from './enclosureSolution'

const downloads = new Map<string, Map<string, Response>>()
beforeEach(() => {
  downloads.clear()
  vi.stubGlobal('caches', { open: async (name: string) => {
    const entries = downloads.get(name) ?? new Map<string, Response>()
    downloads.set(name, entries)
    return {
      put: async (url: string, response: Response) => { entries.set(url, response.clone()) },
      match: async (url: string) => entries.get(url)?.clone(),
    }
  } })
})
afterEach(() => vi.unstubAllGlobals())

it('downloads a matching optimal witness with the board for offline reveal', async () => {
  const fetcher = async (url: string) => new Response(JSON.stringify(url.includes('/solutions/') ? witness : daily))
  const puzzle = await loadPuzzle(daily.id, fetcher)
  if (!isEnclosurePuzzle(puzzle)) throw Error('enclosure expected')
  await vi.waitFor(() => expect(downloads.get('daily-puzzles.enclosure-solutions:/:v1')?.has(enclosureSolutionUrl(daily.id))).toBe(true))
  const offline = async (): Promise<Response> => { throw Error('offline') }
  expect((await loadPuzzle(daily.id, offline)).id).toBe(daily.id)
  expect(await loadEnclosureSolution(daily.id, puzzle.board, offline)).toEqual(witness)
})

it('keeps puzzle play available when its solution cannot be downloaded', async () => {
  const puzzle = await loadPuzzle(daily.id, async url => url.includes('/solutions/')
    ? new Response('missing', { status: 404 }) : new Response(JSON.stringify(daily)))
  expect(puzzle.id).toBe(daily.id)
  if (!isEnclosurePuzzle(puzzle)) throw Error('enclosure expected')
  await expect(loadEnclosureSolution(daily.id, puzzle.board, async () => { throw Error('offline') })).rejects.toThrow(/optimal solution/i)
})

it('acquires a missing witness when an older saved board is loaded again online', async () => {
  await loadPuzzle(daily.id, async url => url.includes('/solutions/')
    ? new Response('missing', { status: 404 }) : new Response(JSON.stringify(daily)))
  await loadPuzzle(daily.id, async url => {
    if (!url.includes('/solutions/')) throw Error('puzzle request unavailable')
    return new Response(JSON.stringify(witness))
  })
  await vi.waitFor(() => expect(downloads.get('daily-puzzles.enclosure-solutions:/:v1')?.has(enclosureSolutionUrl(daily.id))).toBe(true))
})

it('does not delay a playable board while an optional witness request is stalled', async () => {
  let finish: ((response: Response) => void) | undefined
  const stalled = new Promise<Response>(resolve => { finish = resolve })
  const loaded = vi.fn()
  const pending = loadPuzzle(daily.id, async url => url.includes('/solutions/') ? stalled : new Response(JSON.stringify(daily))).then(puzzle => { loaded(); return puzzle })
  try { await vi.waitFor(() => expect(loaded).toHaveBeenCalledOnce(), { timeout: 1_000 }) }
  finally { finish?.(new Response(JSON.stringify(witness))) }
  expect((await pending).id).toBe(daily.id)
  await vi.waitFor(() => expect(downloads.get('daily-puzzles.enclosure-solutions:/:v1')?.has(enclosureSolutionUrl(daily.id))).toBe(true))
})
