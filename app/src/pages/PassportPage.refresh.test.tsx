import { PUZZLE_TYPES } from '../domain/board'
import { PUZZLE_TYPE_PUBLISHED } from '../domain/games'
// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { expect, it, vi } from 'vitest'
import { puzzleIdFor } from '../domain/dates'
import { STATS_STORAGE_KEY } from '../lib/stats'
import { PassportPage } from './PassportPage'

const publishedFamilyCount = PUZZLE_TYPES.filter(type => PUZZLE_TYPE_PUBLISHED[type]).length

it('refreshes its collection when returning after history changes in another tab', async () => {
  localStorage.clear()
  const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  try {
    await act(async () => root.render(<MemoryRouter><PassportPage /></MemoryRouter>))
    expect(container.textContent).toContain(`0 of ${publishedFamilyCount}`)
    localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify([{ id: puzzleIdFor('2026-10-20', 'trio'), puzzleType: 'trio', size: 9, elapsedMs: 1, hints: 0, solvedAt: 1 }]))
    await act(async () => window.dispatchEvent(new Event('pageshow')))
    expect(container.textContent).toContain(`1 of ${publishedFamilyCount}`)
    localStorage.clear()
    await act(async () => window.dispatchEvent(new Event('focus')))
    expect(container.textContent).toContain(`0 of ${publishedFamilyCount}`)
  } finally {
    await act(async () => root.unmount())
    container.remove()
    localStorage.clear()
    scroll.mockRestore()
  }
})
