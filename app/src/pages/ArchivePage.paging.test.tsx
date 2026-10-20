// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { PublishedPuzzle } from '../lib/puzzles'
import { ArchivePage } from './ArchivePage'

const archive = vi.hoisted(() => ({ list: vi.fn() }))

vi.mock('../lib/puzzles', async original => ({
  ...await original<typeof import('../lib/puzzles')>(),
  listPublishedPuzzles: archive.list,
}))
vi.mock('../lib/useToday', () => ({ useToday: () => '2026-10-20' }))

const latest: PublishedPuzzle = { id: '2026-10-19', type: 'queens', difficulty: null }
const older: PublishedPuzzle = { id: '2026-09-15', type: 'queens', difficulty: null }

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  archive.list.mockClear()
  archive.list.mockImplementation(async (_today: string, _fetcher: unknown, olderDays = 0) =>
    olderDays === 0 ? [latest] : [older])
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  archive.list.mockReset()
})

async function click(label: string) {
  const button = [...container.querySelectorAll('button')]
    .find(element => element.textContent?.includes(label))
  if (!button) throw Error(`missing button ${label}`)
  await act(async () => {
    button.click()
    await Promise.resolve()
  })
}

it('loads older 30-day windows on demand and can return to the latest', async () => {
  await act(async () => {
    root.render(<MemoryRouter initialEntries={['/archive']}><ArchivePage /></MemoryRouter>)
    await Promise.resolve()
  })
  expect(container.querySelector('a[href="/archive/2026-10-19"]')).not.toBeNull()
  expect(archive.list).toHaveBeenNthCalledWith(1, '2026-10-20', expect.any(Function), 0)

  await click('Older')
  expect(archive.list).toHaveBeenLastCalledWith('2026-10-20', expect.any(Function), 30)
  expect(container.querySelector('a[href="/archive/2026-09-15"]')).not.toBeNull()
  expect(container.querySelector('a[href="/archive/2026-10-19"]')).toBeNull()
  expect(container.querySelector('button[aria-label="Show newer puzzles"]')).not.toBeNull()

  await click('Newer')
  expect(archive.list).toHaveBeenLastCalledWith('2026-10-20', expect.any(Function), 0)
  expect(container.querySelector('a[href="/archive/2026-10-19"]')).not.toBeNull()
  expect(container.querySelector('button[aria-label="Show newer puzzles"]')).toBeNull()
})
