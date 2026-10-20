import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { OfflineMessage, OfflineStatus } from './OfflineStatus'
import { registerOfflineApp } from '../lib/offline'

afterEach(() => vi.unstubAllGlobals())

it('registers within the app base and waits for activation before reporting readiness', async () => {
  let activate!: (value: unknown) => void
  const register = vi.fn(async () => ({ waiting: null, installing: null, addEventListener: () => {} }))
  vi.stubGlobal('navigator', { serviceWorker: { register, ready: new Promise((resolve) => { activate = resolve }) } })
  const done = vi.fn()
  const pending = registerOfflineApp().then(done)
  await Promise.resolve()
  expect(done).not.toHaveBeenCalled()
  activate({})
  await pending
  expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/', updateViaCache: 'none' })
  expect(done).toHaveBeenCalledWith(true)
})

it('reports a waiting update without reloading the page', async () => {
  const update = vi.fn()
  const register = vi.fn(async () => ({ waiting: {}, installing: null, addEventListener: () => {} }))
  vi.stubGlobal('navigator', {
    serviceWorker: { register, ready: Promise.resolve({}), controller: {} },
  })

  expect(await registerOfflineApp(update)).toBe(true)
  expect(update).toHaveBeenCalledOnce()
})

it('reports a worker that finishes installing while the app is open', async () => {
  const update = vi.fn()
  let updateFound: (() => void) | undefined
  let stateChange: (() => void) | undefined
  const installing = {
    state: 'installing',
    addEventListener: (_type: string, listener: () => void) => { stateChange = listener },
  }
  const registration = {
    waiting: null as typeof installing | null,
    installing: installing as typeof installing | null,
    addEventListener: (type: string, listener: () => void) => {
      if (type === 'updatefound') updateFound = listener
    },
  }
  vi.stubGlobal('navigator', {
    serviceWorker: { register: async () => registration, ready: Promise.resolve({}), controller: {} },
  })

  await registerOfflineApp(update)
  registration.installing = installing
  updateFound?.()
  registration.waiting = installing
  installing.state = 'installed'
  stateChange?.()

  expect(update).toHaveBeenCalledOnce()
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

it('warns when the shell activates but a puzzle cannot be saved', async () => {
  vi.stubGlobal('navigator', {
    serviceWorker: {
      register: async () => ({ waiting: null, installing: null, addEventListener: () => {} }),
      ready: Promise.resolve({}),
    },
  })
  const ready = await registerOfflineApp()
  const events = new EventTarget()
  vi.stubGlobal('window', events)
  let downloadFailed = false
  events.addEventListener('puzzle-download-failed', () => { downloadFailed = true })
  vi.stubGlobal('caches', { open: async () => ({ put: async () => { throw new Error('quota') } }) })
  const { loadPuzzle } = await import('../lib/puzzles')
  const { default: puzzle } = await import('../../public/puzzles/2026-10-15.json')
  expect((await loadPuzzle(puzzle.id, async () => new Response(JSON.stringify(puzzle)))).id).toBe(puzzle.id)
  expect(downloadFailed).toBe(true)
  const html = renderToStaticMarkup(<MemoryRouter><OfflineMessage online ready={ready} updateReady={false} downloadFailed={downloadFailed} /></MemoryRouter>)
  expect(html).toContain('App ready offline.')
  expect(html).toContain('Some puzzles could not be saved')
  expect(html).not.toContain('Open puzzles online to save them.')
})

it('announces a waiting update without forcing a reload', () => {
  const html = renderToStaticMarkup(
    <MemoryRouter><OfflineMessage online ready updateReady downloadFailed={false} /></MemoryRouter>,
  )
  expect(html).toContain('A new version is ready.')
  expect(html).toContain('Close every open app window to update.')
})
