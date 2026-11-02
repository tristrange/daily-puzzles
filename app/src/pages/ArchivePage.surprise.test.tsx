// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import queens from '../../public/puzzles/2026-10-19.json'
import { previousPuzzleIds } from '../domain/dates'
import { parsePuzzle } from '../domain/puzzle'
import type { PublishedPuzzle } from '../lib/puzzles'
import { STATS_STORAGE_KEY } from '../lib/stats'
import { ArchivePage } from './ArchivePage'
import { PuzzlePage } from './PuzzlePage'

const archive = vi.hoisted(() => ({ list: vi.fn(), probe: vi.fn() }))

vi.mock('../lib/puzzles', async original => ({
  ...await original<typeof import('../lib/puzzles')>(),
  listPublishedPuzzles: archive.list,
  probePuzzles: archive.probe,
}))
vi.mock('../lib/useToday', () => ({ useToday: () => '2026-10-20' }))
vi.mock('../components/PuzzleView', () => ({
  PuzzleView: ({ id }: { readonly id: string }) => <div data-testid="puzzle-view">{id}</div>,
}))

const todayPuzzle = parsePuzzle({ ...queens, id: '2026-10-20' })
const listed: PublishedPuzzle = { id: '2026-10-20', type: 'queens', difficulty: null }

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear()
  archive.list.mockReset()
  archive.list.mockResolvedValue([listed])
  archive.probe.mockReset()
  archive.probe.mockImplementation(async (ids: readonly string[]) =>
    ids.map(id => ({ id, puzzle: id === '2026-10-20' ? todayPuzzle : null })),
  )
  vi.spyOn(Math, 'random').mockReturnValue(0)
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  localStorage.clear()
  archive.list.mockReset()
  archive.probe.mockReset()
  vi.restoreAllMocks()
})

async function render() {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/archive?game=queens&page=2']}>
        <Link to="/">Today</Link>
        <Routes>
          <Route path="/archive" element={<ArchivePage />} />
          <Route path="/archive/:id" element={<PuzzlePage />} />
          <Route path="/" element={<h1>Today page</h1>} />
        </Routes>
      </MemoryRouter>,
    )
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}

async function click(label: string) {
  const control = [...container.querySelectorAll<HTMLElement>('a, button')]
    .find(element => element.textContent?.includes(label))
  if (!control) throw Error(`missing control ${label}`)
  await act(async () => {
    control.click()
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}

it('opens the chosen puzzle with the current archive page as the return target', async () => {
  await render()

  await click('Surprise me')

  expect(container.querySelector('[data-testid="puzzle-view"]')?.textContent).toBe('2026-10-20')
  expect(container.querySelector('a[href="/archive?game=queens&page=2"]')).not.toBeNull()
})

it('explains when the archive cannot be reached', async () => {
  archive.probe.mockResolvedValue([{ id: '2026-10-20', puzzle: null, unavailable: true }])
  await render()

  await click('Surprise me')

  expect(container.textContent).toContain('Couldn’t reach the archive. Check your connection and try again.')
})

it('explains when the puzzles it found are already completed', async () => {
  localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify(previousPuzzleIds('2026-10-20', 25).map(id => ({
    id, puzzleType: 'queens', size: 9, elapsedMs: 60000, hints: 0, solvedAt: 1,
  }))))
  await render()

  await click('Surprise me')

  expect(container.textContent).toContain(
    'No unsolved Queens puzzle was found. The Queens puzzles found are already completed.',
  )
})

it('suggests trying again when a limited search cannot find an unsolved puzzle', async () => {
  localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify([{
    id: '2026-10-20', puzzleType: 'queens', size: 9, elapsedMs: 60000, hints: 0, solvedAt: 1,
  }]))
  await render()
  await click('Surprise me')
  expect(container.textContent).toContain('Try again or choose another game.')
})

it('does not open a result after leaving the archive', async () => {
  let finish: (value: { id: string; puzzle: typeof todayPuzzle }[]) => void = () => {}
  archive.probe.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  await render()
  await click('Surprise me')
  await click('Today')
  await act(async () => { finish([{ id: todayPuzzle.id, puzzle: todayPuzzle }]); await new Promise(resolve => setTimeout(resolve, 0)) })
  expect(container.querySelector('h1')?.textContent).toBe('Today page')
  expect(container.querySelector('[data-testid="puzzle-view"]')).toBeNull()
})

it('does not open a puzzle completed in another tab while searching', async () => {
  let finish: (value: { id: string; puzzle: typeof todayPuzzle }[]) => void = () => {}
  archive.probe.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  await render()
  await click('Surprise me')
  await act(async () => {
    localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify([{
      id: todayPuzzle.id, puzzleType: 'queens', size: 9, elapsedMs: 60000, hints: 0, solvedAt: 1,
    }]))
    window.dispatchEvent(new StorageEvent('storage', { key: STATS_STORAGE_KEY }))
  })
  await act(async () => { finish([{ id: todayPuzzle.id, puzzle: todayPuzzle }]); await new Promise(resolve => setTimeout(resolve, 0)) })
  expect(container.querySelector('[data-testid="puzzle-view"]')).toBeNull()
  expect(container.textContent).toMatch(/completed|try again/i)
})

it('discards an old search and allows a new one after switching games and back', async () => {
  let finish: (value: { id: string; puzzle: typeof todayPuzzle }[]) => void = () => {}
  archive.probe.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  await render()
  await click('Surprise me')
  await click('Sudoku')
  await click('Queens')
  await act(async () => { finish([{ id: todayPuzzle.id, puzzle: todayPuzzle }]); await new Promise(resolve => setTimeout(resolve, 0)) })
  expect(container.querySelector('[data-testid="puzzle-view"]')).toBeNull()
  expect(container.querySelector<HTMLButtonElement>('.archive-surprise button')?.disabled).toBe(false)
  await click('Surprise me')
  expect(container.querySelector('[data-testid="puzzle-view"]')?.textContent).toBe(todayPuzzle.id)
})
