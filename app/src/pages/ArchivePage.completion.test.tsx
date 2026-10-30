// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { PublishedPuzzle } from '../lib/puzzles'
import { STATS_STORAGE_KEY } from '../lib/stats'
import { ArchivePage } from './ArchivePage'

const archive = vi.hoisted(() => ({ list: vi.fn() }))

vi.mock('../lib/puzzles', async original => ({
  ...await original<typeof import('../lib/puzzles')>(),
  listPublishedPuzzles: archive.list,
}))
vi.mock('../lib/useToday', () => ({ useToday: () => '2026-10-20' }))

const puzzle: PublishedPuzzle = { id: '2026-10-19', type: 'queens', difficulty: null }

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear()
  archive.list.mockReset()
  archive.list.mockResolvedValue([puzzle])
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  localStorage.clear()
  archive.list.mockReset()
})

function BackToArchive() {
  const navigate = useNavigate()
  return <button onClick={() => navigate(-1)}>Back to archive</button>
}

async function render() {
  await act(async () => {
    root.render(<MemoryRouter initialEntries={['/archive']}><Routes>
      <Route path="/archive" element={<ArchivePage />} />
      <Route path="/archive/:id" element={<BackToArchive />} />
    </Routes></MemoryRouter>)
    await Promise.resolve()
  })
}

async function click(id: string) {
  const control = container.querySelector<HTMLElement>(id)
  if (!control) throw Error(`missing control ${id}`)
  await act(async () => {
    control.click()
    await Promise.resolve()
  })
}

it('shows a solve after returning to the archive through browser history', async () => {
  await render()
  expect(container.querySelector('.archive-completed')).toBeNull()

  await click('a[href="/archive/2026-10-19"]')
  localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify([{
    id: puzzle.id, puzzleType: 'queens', size: 9, elapsedMs: 60000, hints: 0, solvedAt: Date.now(),
  }]))

  await click('button')
  expect(container.querySelector('a[href="/archive/2026-10-19"]')?.textContent).toContain('Completed')
  expect(container.querySelector('.archive-completed')).not.toBeNull()
})
