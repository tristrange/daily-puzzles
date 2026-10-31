// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { OfflineUpdate } from '../lib/offline'
import { OfflineStatus } from './OfflineStatus'

const offline = vi.hoisted(() => ({ register: vi.fn() }))
vi.mock('../lib/offline', () => ({
  PUZZLE_DOWNLOAD_FAILED: 'puzzle-download-failed',
  registerOfflineApp: offline.register,
}))

let roots: Root[]
let containers: HTMLDivElement[]
let notices: ((update: OfflineUpdate) => void)[]

beforeEach(() => {
  vi.stubEnv('PROD', true)
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  roots = []
  containers = []
  notices = []
  offline.register.mockImplementation(async (notice: (update: OfflineUpdate) => void) => { notices.push(notice); return true })
})

afterEach(async () => {
  for (const root of roots) await act(async () => root.unmount())
  for (const container of containers) container.remove()
  offline.register.mockReset()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

async function mount(path: string) {
  const reload = vi.fn()
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  roots.push(root)
  containers.push(container)
  const router = createMemoryRouter([{ path: '*', element: <OfflineStatus reload={reload} /> }], { initialEntries: [path] })
  await act(async () => root.render(<RouterProvider router={router} />))
  return { container, reload, router, notice: notices.at(-1)! }
}

it('keeps a puzzle open until the player chooses to update', async () => {
  const player = await mount('/archive/board')
  const activate = vi.fn(() => true)
  await act(async () => player.notice({ kind: 'waiting', activate }))
  expect(activate).not.toHaveBeenCalled()
  expect(player.reload).not.toHaveBeenCalled()
  expect(player.container.textContent).toContain('clears undo and redo history')
  await act(async () => player.container.querySelector('button')!.click())
  expect(activate).toHaveBeenCalledOnce()
  expect(player.reload).not.toHaveBeenCalled()
  await act(async () => player.notice({ kind: 'active' }))
  expect(player.reload).toHaveBeenCalledOnce()
})

it('updates Today while leaving a puzzle in another tab untouched', async () => {
  const player = await mount('/archive/board')
  const home = await mount('/')
  const activate = vi.fn(() => true)
  await act(async () => {
    player.notice({ kind: 'waiting', activate })
    home.notice({ kind: 'waiting', activate })
  })
  expect(activate).toHaveBeenCalledOnce()
  await act(async () => { player.notice({ kind: 'active' }); home.notice({ kind: 'active' }) })
  expect(home.reload).toHaveBeenCalledOnce()
  expect(player.reload).not.toHaveBeenCalled()
  expect(player.container.textContent).toContain('Update now')
  await act(async () => player.router.navigate('/'))
  expect(player.reload).toHaveBeenCalledOnce()
})

it('lets the player retry if activating the update stalls', async () => {
  vi.useFakeTimers()
  const player = await mount('/archive/board')
  const activate = vi.fn(() => true)
  await act(async () => player.notice({ kind: 'waiting', activate }))
  await act(async () => player.container.querySelector('button')!.click())
  expect(player.container.textContent).toContain('Updating…')
  await act(async () => vi.advanceTimersByTime(12_000))
  expect(player.container.textContent).toContain('Update did not finish')
  await act(async () => player.container.querySelector('button')!.click())
  expect(activate).toHaveBeenCalledTimes(2)
  await act(async () => player.notice({ kind: 'active' }))
  expect(player.reload).toHaveBeenCalledOnce()
})

it('finishes updating Today if activation completes after the retry warning', async () => {
  vi.useFakeTimers()
  const home = await mount('/')
  await act(async () => home.notice({ kind: 'waiting', activate: () => true }))
  await act(async () => vi.advanceTimersByTime(12_000))
  expect(home.container.textContent).toContain('Update did not finish')
  await act(async () => home.notice({ kind: 'active' }))
  expect(home.reload).toHaveBeenCalledOnce()
})

it('does not interrupt a puzzle opened while Today was updating', async () => {
  const player = await mount('/')
  await act(async () => player.notice({ kind: 'waiting', activate: () => true }))
  await act(async () => player.router.navigate('/archive/board'))
  await act(async () => player.notice({ kind: 'active' }))
  expect(player.reload).not.toHaveBeenCalled()
  expect(player.container.textContent).toContain('Update now')
  await act(async () => player.container.querySelector('button')!.click())
  expect(player.reload).toHaveBeenCalledOnce()
})
