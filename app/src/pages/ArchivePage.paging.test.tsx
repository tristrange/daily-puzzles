// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { PublishedPuzzle } from '../lib/puzzles'
import { ArchivePage } from './ArchivePage'

const archive = vi.hoisted(() => ({ list: vi.fn(), today: '2026-10-20' }))

vi.mock('../lib/puzzles', async original => ({
  ...await original<typeof import('../lib/puzzles')>(),
  listPublishedPuzzles: archive.list,
}))
vi.mock('../lib/useToday', () => ({ useToday: () => archive.today }))

const latest: PublishedPuzzle = { id: '2026-10-19', type: 'queens', difficulty: null }
const older: PublishedPuzzle = { id: '2026-10-13', type: 'queens', difficulty: null }
const first: PublishedPuzzle = { id: '2026-09-26', type: 'queens', difficulty: null }

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  archive.today = '2026-10-20'
  archive.list.mockClear()
  archive.list.mockImplementation(async (_today: string, _fetcher: unknown, olderDays = 0) => {
    if (olderDays === 0) return [latest]
    if (olderDays === 7) return [older]
    if (olderDays === 21) return [first]
    return []
  })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  archive.list.mockReset()
})

async function renderArchive(path = '/archive') {
  await act(async () => {
    root.render(<MemoryRouter initialEntries={[path]}><ArchivePage /></MemoryRouter>)
    await Promise.resolve()
  })
}

async function click(label: string) {
  const control = [...container.querySelectorAll<HTMLElement>('a, button')]
    .find(element => element.textContent?.includes(label))
  if (!control) throw Error(`missing control ${label}`)
  await act(async () => {
    control.click()
    await Promise.resolve()
  })
}

it('loads older seven-day windows on demand and can return to the latest', async () => {
  await renderArchive()
  expect(container.querySelector('a[href="/archive/2026-10-19"]')).not.toBeNull()
  expect(container.querySelector('a[href="/archive?game=queens&page=1"]')).not.toBeNull()
  expect(archive.list).toHaveBeenNthCalledWith(1, '2026-10-20', expect.any(Function), 0)

  await click('Older')
  expect(archive.list).toHaveBeenLastCalledWith('2026-10-20', expect.any(Function), 7)
  expect(container.querySelector('a[href="/archive/2026-10-13?page=1"]')).not.toBeNull()
  expect(container.querySelector('a[href="/archive/2026-10-19"]')).toBeNull()
  expect(container.querySelector('a[aria-label="Show newer puzzles"]')).not.toBeNull()

  await click('Newer')
  expect(archive.list).toHaveBeenLastCalledWith('2026-10-20', expect.any(Function), 0)
  expect(container.querySelector('a[href="/archive/2026-10-19"]')).not.toBeNull()
  expect(container.querySelector('a[aria-label="Show newer puzzles"]')).toBeNull()
})

it('stops offering older when the window includes the first archive date', async () => {
  archive.today = '2026-09-26'
  archive.list.mockResolvedValue([first])
  await renderArchive()
  expect(archive.list).toHaveBeenCalledWith('2026-09-26', expect.any(Function), 0)
  expect(container.querySelector('a[href="/archive/2026-09-26"]')).not.toBeNull()
  expect(container.querySelector('a[aria-label="Show older puzzles"]')).toBeNull()
  expect(container.querySelector('a[aria-label="Show newer puzzles"]')).toBeNull()
})

it('hides older on the partial final week while keeping newer navigation', async () => {
  await renderArchive('/archive?page=3')
  expect(archive.list).toHaveBeenCalledWith('2026-10-20', expect.any(Function), 21)
  expect(container.querySelector('a[href="/archive/2026-09-26?page=3"]')).not.toBeNull()
  expect(container.querySelector('a[aria-label="Show older puzzles"]')).toBeNull()
  expect(container.querySelector('a[aria-label="Show newer puzzles"]')).not.toBeNull()
})

it('offers older again after navigating back to a newer page', async () => {
  await renderArchive('/archive?page=3')
  await click('Newer')
  expect(archive.list).toHaveBeenLastCalledWith('2026-10-20', expect.any(Function), 14)
  expect(container.querySelector('a[href="/archive?game=queens&page=3"]')).not.toBeNull()
  expect(container.querySelector('a[href="/archive?game=queens&page=1"]')).not.toBeNull()
  expect(container.querySelector('a[aria-label="Show older puzzles"]')).not.toBeNull()
})

it('keeps older available when an offline page is empty before the final window', async () => {
  archive.list.mockResolvedValue([])
  await renderArchive('/archive?page=2')
  expect(container.textContent).toContain('No puzzles in this archive window.')
  expect(container.querySelector('a[aria-label="Show older puzzles"]')).not.toBeNull()
})
