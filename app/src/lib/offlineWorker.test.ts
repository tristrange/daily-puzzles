import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import { renderOfflineWorker } from '../../build/offline'

const template = () => readFileSync(new URL('../../offline/sw.js', import.meta.url), 'utf8')
const files = { 'index.html': '<html>app</html>', 'assets/main.js': 'main', 'assets/words.js': 'lazy dictionary' }

function worker(base = '/', broken = false) {
  const listeners = new Map<string, (event: unknown) => void>()
  const source = renderOfflineWorker(base, files, template())
  const currentName = JSON.parse(source.match(/const CACHE_NAME = (.+)/)![1]!) as string
  const addAll = vi.fn(async (_files: Request[]) => { if (broken) throw new Error('offline') })
  const match = vi.fn(async () => new Response('installed build'))
  const remove = vi.fn(async () => true)
  const claim = vi.fn(async () => {})
  const skipWaiting = vi.fn(async () => {})
  const fetcher = vi.fn(async () => new Response('network'))
  const caches = {
    open: vi.fn(async () => ({ addAll, match })),
    keys: async () => [
      ...[1, 2, 3, 4].map((version) => `daily-puzzles.app:${base}:old${version}`),
      currentName,
      `daily-puzzles.puzzles:${base}:v1`,
      'daily-puzzles.app:/neighbor/:old',
      'unrelated',
    ],
    delete: remove,
  }
  vm.runInNewContext(source, {
    self: {
      location: new URL(`https://example.test${base}sw.js`),
      addEventListener: (name: string, handler: (event: unknown) => void) => listeners.set(name, handler),
      clients: { claim },
      skipWaiting,
    }, caches, fetch: fetcher, URL, Request,
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
  const message = (data: unknown) => {
    let pending: Promise<unknown> | undefined
    listeners.get('message')!({ data, waitUntil: (promise: Promise<unknown>) => { pending = promise } })
    return pending
  }
  return { source, lifecycle, request, message, addAll, match, remove, claim, skipWaiting, fetcher }
}

describe.each(['/', '/daily-puzzles/'])('offline worker at %s', (base) => {
  it('installs the complete shell including lazy chunks under the correct base', async () => {
    const sw = worker(base)
    await sw.lifecycle('install')
    expect(sw.skipWaiting).not.toHaveBeenCalled()
    expect(sw.addAll.mock.calls[0]![0].map((request) => new URL(request.url).pathname)).toEqual([
      `${base}`, `${base}assets/main.js`, `${base}assets/words.js`,
    ])
  })
  it('fails installation if even one shell file cannot be fetched', async () => {
    await expect(worker(base, true).lifecycle('install')).rejects.toThrow('offline')
  })
  it('retains the three newest previous shells and removes only older shells for this base', async () => {
    const sw = worker(base)
    await sw.lifecycle('activate')
    expect(sw.remove.mock.calls).toEqual([[`daily-puzzles.app:${base}:old1`]])
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
  it('activates early only when a player requests an update', async () => {
    const sw = worker(base)
    expect(sw.message({ type: 'OTHER' })).toBeUndefined()
    expect(sw.skipWaiting).not.toHaveBeenCalled()
    await sw.message({ type: 'ACTIVATE_UPDATE' })
    expect(sw.skipWaiting).toHaveBeenCalledOnce()
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

it('serves a new shell and the previous build’s lazy code offline after an update', async () => {
  const base = 'https://example.test/'
  const oldName = 'daily-puzzles.app:/:old'
  const puzzleName = 'daily-puzzles.puzzles:/:v1'
  const stored = new Map<string, Map<string, string>>([
    [oldName, new Map([[`${base}assets/old.js`, 'old lazy code']])],
    [puzzleName, new Map([[`${base}puzzles/board.json`, 'saved puzzle']])],
  ])
  const listeners = new Map<string, (event: unknown) => void>()
  const buildB = { ...files, 'index.html': '<script src="/assets/main.js"></script>build B' }
  const network = new Map(Object.entries(buildB).map(([name, body]) => [new URL(name === 'index.html' ? '' : name, base).href, body]))
  const httpCache = new Map([[base, '<script src="/assets/old.js"></script>build A']])
  const caches = {
    keys: async () => [...stored.keys()],
    delete: async (name: string) => stored.delete(name),
    open: async (name: string) => {
      if (!stored.has(name)) stored.set(name, new Map())
      const entries = stored.get(name)!
      return {
        addAll: async (inputs: (string | Request)[]) => {
          for (const input of inputs) {
            const request = input instanceof Request ? input : new Request(new URL(input, base))
            const body = request.cache === 'reload' ? network.get(request.url) : httpCache.get(request.url) ?? network.get(request.url)
            if (body === undefined) throw new Error('missing file')
            entries.set(request.url, body)
          }
        },
        match: async (url: string) => entries.has(url) ? new Response(entries.get(url)) : undefined,
      }
    },
  }
  vm.runInNewContext(renderOfflineWorker('/', buildB, template()), {
    self: { location: new URL('sw.js', base), addEventListener: (name: string, fn: (event: unknown) => void) => listeners.set(name, fn), clients: { claim: async () => {} } },
    URL, Request, caches, fetch: async () => { throw new Error('server stopped') },
  })
  for (const name of ['install', 'activate']) {
    let pending: Promise<unknown> | undefined
    listeners.get(name)!({ waitUntil: (promise: Promise<unknown>) => { pending = promise } })
    await pending
  }
  expect(stored.has(oldName)).toBe(true)
  expect(stored.get(puzzleName)!.get(`${base}puzzles/board.json`)).toBe('saved puzzle')
  for (const [path, mode, expected] of [['', 'navigate', 'build B'], ['assets/main.js', 'cors', 'main'], ['assets/words.js', 'cors', 'lazy dictionary'], ['assets/old.js', 'cors', 'old lazy code']]) {
    let pending: Promise<Response> | undefined
    listeners.get('fetch')!({ request: { url: new URL(path!, base).href, mode, method: 'GET' }, respondWith: (promise: Promise<Response>) => { pending = promise } })
    expect(await (await pending)!.text()).toContain(expected)
  }
})
