import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EnclosureGrid, enclosureFingerprint } from '../domain/enclosure'
import { enclosureSolutionUrl, loadEnclosureSolution, parseEnclosureSolution } from './enclosureSolution'

const id = '2026-11-11-enclosure'
const grid = new EnclosureGrid(3, [], 4, 4, 1)
const raw = { version: 1, id, board: enclosureFingerprint(grid), walls: [1, 3, 5, 7] }
const saved = new Map<string, Response>()
const cache = {
  match: vi.fn(async (url: string) => saved.get(url)?.clone()),
  put: vi.fn(async (url: string, response: Response) => { saved.set(url, response.clone()) }),
}
beforeEach(() => {
  saved.clear()
  cache.match.mockClear(); cache.put.mockClear()
  vi.stubGlobal('caches', { open: vi.fn(async () => cache) })
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('optimal enclosure witness validation', () => {
  it('accepts a legal optimum bound to this exact puzzle', () => {
    expect(parseEnclosureSolution(raw, id, grid)).toEqual(raw)
  })
  it.each([
    null, [], { ...raw, version: 2 }, { ...raw, id: '2026-11-12-enclosure' },
    { ...raw, board: enclosureFingerprint(new EnclosureGrid(3, [], 4, 3, 1)) },
    ...[[4], [1, 3, 3, 7], [3, 1, 5, 7], [-1, 3, 5, 7], [1.5, 3, 5, 7],
      [0, 1, 3, 5, 7], [1, 3, 5], ['1', 3, 5, 7]].map(walls => ({ ...raw, walls })),
  ])('rejects malformed, mismatched, illegal or escaping layouts: %j', value => {
    expect(parseEnclosureSolution(value, id, grid)).toBeNull()
  })
  it('rejects an enclosed layout below the certified optimum', () => {
    const meadow = new EnclosureGrid(4, [0, 1, 2, 3, 4, 7, 8, 11, 12, 13, 14, 15], 5, 2, 4)
    expect(parseEnclosureSolution({ ...raw, board: enclosureFingerprint(meadow), walls: [6, 9] }, id, meadow)).toBeNull()
  })
  it('requires a known optimal target and an enclosure id', () => {
    expect(parseEnclosureSolution(raw, id, new EnclosureGrid(3, [], 4, 4))).toBeNull()
    expect(parseEnclosureSolution({ ...raw, id: '2026-11-11' }, '2026-11-11', grid)).toBeNull()
  })
})

describe('optimal enclosure downloads', () => {
  it('validates and caches the response for later offline reveal', async () => {
    const fetcher = vi.fn(async (_url: string) => new Response(JSON.stringify(raw)))
    expect(await loadEnclosureSolution(id, grid, fetcher)).toEqual(raw)
    expect(fetcher.mock.calls[0]?.[0]).toBe(enclosureSolutionUrl(id))
    const offline = vi.fn(async (): Promise<Response> => { throw Error('offline') })
    expect(await loadEnclosureSolution(id, grid, offline)).toEqual(raw)
    expect(offline).not.toHaveBeenCalled()
  })
  it.each([
    () => new Response('<html>SPA shell</html>'),
    () => new Response('missing', { status: 404 }),
    () => new Response(JSON.stringify({ ...raw, walls: [1] })),
  ])('never caches or displays an invalid download', async response => {
    await expect(loadEnclosureSolution(id, grid, async () => response())).rejects.toThrow(/optimal solution/i)
    expect(saved.size).toBe(0)
  })
  it('does not trust a stale cached witness', async () => {
    saved.set(enclosureSolutionUrl(id), new Response(JSON.stringify({ ...raw, id: '2026-11-12-enclosure' })))
    await expect(loadEnclosureSolution(id, grid, async () => { throw Error('offline') })).rejects.toThrow(/optimal solution/i)
  })
  it('can reveal online when cache storage is blocked', async () => {
    vi.stubGlobal('caches', { open: async () => { throw Error('blocked') } })
    expect(await loadEnclosureSolution(id, grid, async () => new Response(JSON.stringify(raw)))).toEqual(raw)
  })
  it('reports a failed offline save while allowing the current reveal, then reports recovery', async () => {
    vi.stubGlobal('window', new EventTarget())
    const events: unknown[] = []
    window.addEventListener('daily-puzzles:enclosure-solution-cache', event => {
      if (event instanceof CustomEvent) events.push(event.detail)
    })
    cache.put.mockRejectedValueOnce(Error('quota'))
    const fetcher = async () => new Response(JSON.stringify(raw))
    expect(await loadEnclosureSolution(id, grid, fetcher)).toEqual(raw)
    expect(events).toContainEqual({ id, saved: false })
    expect(saved.size).toBe(0)
    await loadEnclosureSolution(id, grid, fetcher)
    expect(events).toContainEqual({ id, saved: true })
    expect(saved.size).toBe(1)
  })
  it('uses the app base path for solution URLs and caches', async () => {
    vi.stubEnv('BASE_URL', '/daily-puzzles/')
    const fetcher = vi.fn(async (_url: string) => new Response(JSON.stringify(raw)))
    await loadEnclosureSolution(id, grid, fetcher)
    expect(enclosureSolutionUrl(id)).toBe('/daily-puzzles/solutions/enclosure/2026-11-11-enclosure.json')
    expect(caches.open).toHaveBeenCalledWith('daily-puzzles.enclosure-solutions:/daily-puzzles/:v1')
  })
})
