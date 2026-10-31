import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { OfflineMessage, OfflineStatus } from './OfflineStatus'
import { registerOfflineApp } from '../lib/offline'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

function setupWorker(controller: object | null = {}) {
  const waiting = { postMessage: vi.fn() }
  const registration = Object.assign(new EventTarget(), {
    waiting: null as typeof waiting | null,
    installing: null as (EventTarget & { state: string }) | null,
    update: vi.fn(async () => {}),
  })
  const serviceWorker = Object.assign(new EventTarget(), {
    controller,
    register: vi.fn(async () => registration),
    ready: Promise.resolve(registration),
  })
  const document = Object.assign(new EventTarget(), { visibilityState: 'visible' })
  vi.stubGlobal('window', new EventTarget())
  vi.stubGlobal('document', document)
  vi.stubGlobal('navigator', { onLine: true, serviceWorker })
  return { waiting, registration, serviceWorker, document }
}

it('registers within the app base and waits for activation before reporting readiness', async () => {
  let activate!: () => void
  const { serviceWorker, registration } = setupWorker()
  serviceWorker.ready = new Promise((resolve) => { activate = () => resolve(registration) })
  const done = vi.fn()
  const pending = registerOfflineApp().then(done)
  await Promise.resolve()
  expect(done).not.toHaveBeenCalled()
  activate()
  await pending
  expect(serviceWorker.register).toHaveBeenCalledWith('/sw.js', { scope: '/', updateViaCache: 'none' })
  expect(done).toHaveBeenCalledWith(true)
})

it('reports a waiting update without reloading the page', async () => {
  const update = vi.fn()
  const { waiting, registration } = setupWorker()
  registration.waiting = waiting

  expect(await registerOfflineApp(update)).toBe(true)
  expect(update).toHaveBeenCalledOnce()
  expect(update.mock.calls[0]![0].activate()).toBe(true)
  expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'ACTIVATE_UPDATE' })
  registration.waiting = null
  expect(update.mock.calls[0]![0].activate()).toBe(false)
})

it('reports a worker that finishes installing while the app is open', async () => {
  const update = vi.fn()
  const { registration, waiting } = setupWorker()
  const installing = Object.assign(new EventTarget(), { state: 'installing' })

  await registerOfflineApp(update)
  registration.installing = installing
  registration.dispatchEvent(new Event('updatefound'))
  registration.waiting = waiting
  installing.state = 'installed'
  installing.dispatchEvent(new Event('statechange'))

  expect(update).toHaveBeenCalledOnce()
})

it('ignores the first installation, but notices a later controller change and cleans up listeners', async () => {
  const update = vi.fn()
  const { serviceWorker } = setupWorker(null)
  const abort = new AbortController()
  await registerOfflineApp(update, abort.signal)
  serviceWorker.controller = {}
  serviceWorker.dispatchEvent(new Event('controllerchange'))
  expect(update).not.toHaveBeenCalled()
  serviceWorker.controller = {}
  serviceWorker.dispatchEvent(new Event('controllerchange'))
  expect(update).toHaveBeenCalledWith({ kind: 'active' })
  abort.abort()
  serviceWorker.controller = {}
  serviceWorker.dispatchEvent(new Event('controllerchange'))
  expect(update).toHaveBeenCalledOnce()
})

it('notices an update that activates while registration is still pending', async () => {
  const update = vi.fn()
  const { registration, serviceWorker } = setupWorker()
  let finish!: () => void
  serviceWorker.register.mockImplementation(() => new Promise((resolve) => { finish = () => resolve(registration) }))
  const result = registerOfflineApp(update)
  serviceWorker.controller = {}
  finish()
  expect(await result).toBe(true)
  expect(update).toHaveBeenCalledWith({ kind: 'active' })
})

it('checks for updates on return to the app without polling constantly', async () => {
  vi.useFakeTimers()
  const { registration } = setupWorker()
  await registerOfflineApp()
  window.dispatchEvent(new Event('focus'))
  expect(registration.update).not.toHaveBeenCalled()
  vi.advanceTimersByTime(5 * 60 * 1000)
  window.dispatchEvent(new Event('focus'))
  window.dispatchEvent(new Event('pageshow'))
  expect(registration.update).toHaveBeenCalledOnce()
})

it('leaves online play usable when service workers are absent or registration is denied', async () => {
  vi.stubGlobal('navigator', {})
  expect(await registerOfflineApp()).toBe(false)
  vi.stubGlobal('navigator', { serviceWorker: { register: async () => { throw new Error('denied') } } })
  expect(await registerOfflineApp()).toBe(false)
})

it('points offline players to their saved archive without promising all puzzles are saved', () => {
  vi.stubGlobal('navigator', { onLine: false })
  const html = renderToStaticMarkup(<MemoryRouter><OfflineStatus /></MemoryRouter>)
  expect(html).toContain('Offline')
  expect(html).toContain('href="/archive"')
  expect(html).toContain('saved puzzles')
})

it('warns when a puzzle cannot be saved', async () => {
  const events = new EventTarget()
  vi.stubGlobal('window', events)
  let downloadFailed = false
  events.addEventListener('puzzle-download-failed', () => { downloadFailed = true })
  vi.stubGlobal('caches', { open: async () => ({ put: async () => { throw new Error('quota') } }) })
  const { loadPuzzle } = await import('../lib/puzzles')
  const { default: puzzle } = await import('../../public/puzzles/2026-10-15.json')
  expect((await loadPuzzle(puzzle.id, async () => new Response(JSON.stringify(puzzle)))).id).toBe(puzzle.id)
  expect(downloadFailed).toBe(true)
  const html = renderToStaticMarkup(<MemoryRouter><OfflineMessage online updateReady={false} downloadFailed={downloadFailed} /></MemoryRouter>)
  expect(html).not.toContain('App ready offline.')
  expect(html).not.toContain('Open puzzles online to save them.')
  expect(html).toContain('Some puzzles could not be saved')
})

it('stays quiet online when nothing needs attention', () => {
  const html = renderToStaticMarkup(
    <MemoryRouter><OfflineMessage online updateReady={false} downloadFailed={false} /></MemoryRouter>,
  )
  expect(html).not.toContain('App ready offline.')
  expect(html).not.toContain('Open puzzles online to save them.')
})

it('announces a waiting update with an actionable warning', () => {
  const html = renderToStaticMarkup(
    <MemoryRouter><OfflineMessage online updateReady downloadFailed={false} /></MemoryRouter>,
  )
  expect(html).toContain('A new version is ready.')
  expect(html).toContain('Update now')
  expect(html).toContain('clears undo and redo history')
})
