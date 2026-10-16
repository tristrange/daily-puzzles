const CACHE_NAME = __CACHE_NAME__
const FILES = __FILES__
const BASE = new URL('./', self.location.href)
const APP_PREFIX = `daily-puzzles.app:${BASE.pathname}:`
const URLS = new Set(FILES.map((file) => new URL(file, BASE).href))

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(FILES.map((file) => new Request(new URL(file, BASE), { cache: 'reload' })))))
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith(APP_PREFIX) && name !== CACHE_NAME) await caches.delete(name)
    }
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  const navigation = request.mode === 'navigate' &&
    (url.href.split(/[?#]/)[0] === BASE.href || url.href.split(/[?#]/)[0] === `${BASE.href}index.html`)
  if (!navigation && !URLS.has(url.href)) return
  // Use the installed HTML with its own chunks; a fresh network shell could mix builds.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME)
    const saved = await cache.match(navigation ? BASE.href : request.url)
    return saved || fetch(request)
  })())
})
