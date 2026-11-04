import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import small from '@shared/conformance/id-cases/tracks-small.accept.json'
import medium from '@shared/conformance/id-cases/tracks-medium.accept.json'
import large from '@shared/conformance/id-cases/tracks-large.accept.json'
import queens from '../../public/puzzles/2026-10-17.json'
import { buildArchiveIndex } from '../../build/archiveIndex'
import { loadArchiveIndex, loadIndexedWindow, parseArchiveIndex } from './archiveIndex'
import { puzzleUrl } from './puzzles'

const index = { version: 1, puzzles: [
  { id: small.id, type: 'train-tracks', difficulty: null, width: 8, height: 8 },
  { id: medium.id, type: 'train-tracks', difficulty: null, width: 10, height: 10 },
  { id: large.id, type: 'train-tracks', difficulty: null, width: 12, height: 12 },
] } as const
const response = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
afterEach(() => vi.unstubAllGlobals())

it('builds a metadata-only index from the files available at build time', () => {
  const dir = mkdtempSync(join(tmpdir(), 'puzzle-index-'))
  try {
    mkdirSync(join(dir, 'puzzles'))
    writeFileSync(join(dir, 'puzzles', `${small.id}.json`), JSON.stringify(small))
    let generated = JSON.parse(buildArchiveIndex(dir))
    expect(generated).toEqual({ version: 1, puzzles: [index.puzzles[0]] })
    expect(JSON.stringify(generated)).not.toMatch(/givens|seed|solution|rowClues/)
    writeFileSync(join(dir, 'puzzles', `${medium.id}.json`), JSON.stringify(medium))
    generated = JSON.parse(buildArchiveIndex(dir))
    expect(generated.puzzles).toHaveLength(2)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

it('rejects malformed, duplicated or unsupported index data', () => {
  expect(parseArchiveIndex(index)).toEqual(index.puzzles)
  expect(parseArchiveIndex({ ...index, version: 2 })).toBeNull()
  expect(parseArchiveIndex({ version: 1, puzzles: [...index.puzzles, index.puzzles[0]] })).toBeNull()
  expect(parseArchiveIndex({ version: 1, puzzles: [{ ...index.puzzles[0], type: 'other' }] })).toBeNull()
})

it('uses the saved index and includes newly downloaded boards when offline', async () => {
  const stores = new Map<string, Map<string, Response>>()
  vi.stubGlobal('caches', { open: async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map())
    const store = stores.get(name)!
    return {
      match: async (url: string) => store.get(url)?.clone(),
      put: async (url: string, value: Response) => { store.set(url, value.clone()) },
      keys: async () => [...store.keys()].map(url => ({ url: new URL(url, 'https://example.test').href })),
    }
  } })
  expect(await loadArchiveIndex(async () => response({ version: 1, puzzles: [index.puzzles[0]] }))).toHaveLength(1)
  const cache = await caches.open('daily-puzzles.puzzles:/:v1')
  await cache.put(puzzleUrl(medium.id), response(medium))
  const restored = await loadArchiveIndex(async () => { throw Error('offline') })
  expect(restored?.map(item => item.id)).toEqual([small.id, medium.id])
})

it('loads all games in the window for offline play and retains the usual size order', async () => {
  const requested: string[] = []
  const fetcher = async (url: string) => {
    requested.push(url)
    const puzzle = [queens, small, medium, large].find(value => url.endsWith(`/${value.id}.json`))
    return puzzle ? response(puzzle) : new Response('', { status: 404 })
  }
  const queensEntry = { id: queens.id, type: 'queens' as const, difficulty: null, width: 7, height: 7 }
  const found = await loadIndexedWindow(['2026-10-17'], [...[...index.puzzles].reverse(), queensEntry], fetcher)
  expect(found.map(puzzle => puzzle.id)).toEqual([queens.id, small.id, medium.id, large.id])
  expect(requested).toHaveLength(4)
})
