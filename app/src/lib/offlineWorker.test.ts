import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import { renderOfflineWorker } from '../../build/offline'

const template = () => readFileSync(new URL('../../offline/sw.js', import.meta.url), 'utf8')
const files = { 'index.html': '<html>app</html>', 'assets/main.js': 'main', 'assets/words.js': 'lazy dictionary' }

function worker(base = '/', broken = false) {
  const listeners = new Map<string, (event: unknown) => void>()
  const addAll = vi.fn(async (_files: string[]) => { if (broken) throw new Error('offline') })
  const match = vi.fn(async () => new Response('installed build'))
  const remove = vi.fn(async () => true)
  const claim = vi.fn(async () => {})
  const fetcher = vi.fn(async () => new Response('network'))
  const caches = {
    open: vi.fn(async () => ({ addAll, match })),
    keys: async () => [
      `daily-puzzles.app:${base}:old`,
      `daily-puzzles.puzzles:${base}:v1`,
      'daily-puzzles.app:/neighbor/:old',
      'unrelated',
    ],
    delete: remove,
  }
  const source = renderOfflineWorker(base, files, template())
  vm.runInNewContext(source, {
    self: {
      location: new URL(`https://example.test${base}sw.js`),
      addEventListener: (name: string, handler: (event: unknown) => void) => listeners.set(name, handler),
      clients: { claim },
      skipWaiting: () => { throw new Error('must not force an update') },
    }, caches, fetch: fetcher, URL,
  })
  const lifecycle = (name: string) => {
    let pending: Promise<unknown> | undefined
    listeners.get(name)!({ waitUntil: (promise: Promise<unknown>) => { pending = promise } })
    return pending!
  }
  const request = (path: string, mode = 'cors', method = 'GET') => {
    let pending: Promise<Response> | undefined
    listeners.get('fetch')!({
      request: { url: new URL(path, `https://example.test${base}`).href, mode, method },
      respondWith: (promise: Promise<Response>) => { pending = promise },
    })
    return pending
  }
  return { source, lifecycle, request, addAll, match, remove, claim, fetcher }
}

describe.each(['/', '/daily-puzzles/'])('offline worker at %s', (base) => {
  it('installs the complete shell including lazy chunks under the correct base', async () => {
    const sw = worker(base)
    await sw.lifecycle('install')
    expect([...sw.addAll.mock.calls[0]![0]]).toEqual([
      `${base}`, `${base}assets/main.js`, `${base}assets/words.js`,
    ])
  })
  it('fails installation if even one shell file cannot be fetched', async () => {
    await expect(worker(base, true).lifecycle('install')).rejects.toThrow('offline')
  })
  it('removes only this base’s old app caches and claims without forcing a reload', async () => {
    const sw = worker(base)
    await sw.lifecycle('activate')
    expect(sw.remove.mock.calls).toEqual([[`daily-puzzles.app:${base}:old`]])
    expect(sw.claim).toHaveBeenCalledOnce()
  })
  it('serves consistent installed HTML and cached lazy code when the network is gone', async () => {
    const sw = worker(base)
    expect(await (await sw.request(base, 'navigate'))!.text()).toBe('installed build')
    expect(await (await sw.request(`${base}index.html`, 'navigate'))!.text()).toBe('installed build')
    expect(await (await sw.request(`${base}assets/words.js`))!.text()).toBe('installed build')
    expect(sw.fetcher).not.toHaveBeenCalled()
  })
  it('leaves puzzles, other apps, external files and non-GET requests to the network', () => {
    const sw = worker(base)
    for (const url of [`${base}puzzles/2026-10-17.json`, '/neighbor/', 'https://other.test/assets/main.js', `${base}missing.js`]) {
      expect(sw.request(url)).toBeUndefined()
    }
    expect(sw.request(base, 'navigate', 'POST')).toBeUndefined()
  })
})

it('changes the cache version for worker-only and asset-only changes', () => {
  const first = renderOfflineWorker('/', files, template())
  const changedWorker = renderOfflineWorker('/', files, `${template()}\n// changed behavior`)
  const changedFile = renderOfflineWorker('/', { ...files, 'assets/words.js': 'new dictionary' }, template())
  const cacheName = (source: string) => source.match(/const CACHE_NAME = (.+)/)![1]
  expect(cacheName(first)).not.toBe(cacheName(changedWorker))
  expect(cacheName(first)).not.toBe(cacheName(changedFile))
})
