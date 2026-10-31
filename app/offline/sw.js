const CACHE_NAME = __CACHE_NAME__
const FILES = __FILES__
const BASE = new URL('./', self.location.href)
const APP_PREFIX = `daily-puzzles.app:${BASE.pathname}:`
const URLS = new Set(FILES.map((file) => new URL(file, BASE).href))
// Keep a few previous shells for tabs that are still playing an older build.
const APP_CACHE_LIMIT = 4

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(FILES.map((file) => new Request(new URL(file, BASE), { cache: 'reload' })))))
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'ACTIVATE_UPDATE') event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = (await caches.keys()).filter((name) => name.startsWith(APP_PREFIX))
    const excess = Math.max(0, names.length - APP_CACHE_LIMIT)
    for (const name of names.filter((name) => name !== CACHE_NAME).slice(0, excess)) await caches.delete(name)
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  const navigation = request.mode === 'navigate' &&
    (url.href.split(/[?#]/)[0] === BASE.href || url.href.split(/[?#]/)[0] === `${BASE.href}index.html`)
  const appAsset = url.origin === BASE.origin && url.pathname.startsWith(`${BASE.pathname}assets/`)
  if (!navigation && !URLS.has(url.href) && !appAsset) return
  // Use the installed HTML with its own chunks; a fresh network shell could mix builds.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME)
    const saved = await cache.match(navigation ? BASE.href : request.url)
    if (saved) return saved
    // A claimed older tab may still need a lazy chunk from its original shell.
    if (appAsset) {
      const names = (await caches.keys()).filter((name) => name.startsWith(APP_PREFIX) && name !== CACHE_NAME)
      for (const name of names.reverse()) {
        const previous = await (await caches.open(name)).match(request.url)
        if (previous) return previous
      }
    }
    return fetch(request)
  })())
})
