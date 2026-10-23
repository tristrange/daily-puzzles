// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { STATS_STORAGE_KEY } from '../lib/stats'
import { LearnPage, SudokuLessonPage } from './LearnPage'

let container: HTMLDivElement, root: Root
beforeEach(() => {
  localStorage.clear(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount()); container.remove(); localStorage.clear()
  vi.unstubAllGlobals(); vi.restoreAllMocks()
})
async function mount(url = '/learn/sudoku/locked-candidates') {
  await act(async () => root.render(<MemoryRouter initialEntries={[url]}>
    <Routes><Route path="/learn" element={<LearnPage />} />
      <Route path="/learn/sudoku/:lessonId" element={<SudokuLessonPage />} /></Routes>
  </MemoryRouter>))
}
async function click(name: string) {
  const button = [...container.querySelectorAll<HTMLElement>('button, a')].find(el => el.textContent?.trim() === name || el.getAttribute('aria-label') === name)
  expect(button, name).toBeDefined()
  await act(async () => button!.click())
}

it('teaches one deduction, rejects an unchanged answer and saves only lesson completion', async () => {
  localStorage.setItem(STATS_STORAGE_KEY, '[]')
  localStorage.setItem('daily-progress-sentinel', 'untouched')
  await mount()
  expect(container.querySelectorAll('[role="gridcell"]')).toHaveLength(81)
  expect(container.querySelectorAll('[data-hint="support"]')).toHaveLength(2)
  expect(container.querySelector('[data-hint="target"]')?.getAttribute('data-cell')).toBe('9')
  await click('Check answer')
  expect(container.querySelector('[role="status"]')?.textContent).toContain('Not quite')
  expect(localStorage.length).toBe(2)
  await click('Keep 8'); await click('Check answer')
  expect(container.querySelector('[role="status"]')?.textContent).toContain('Lesson complete')
  expect(container.textContent).toContain('2, 6')
  expect(container.querySelector('[data-cell="9"]')?.getAttribute('aria-label')).toContain('notes 2, 6')
  expect(localStorage.getItem(STATS_STORAGE_KEY)).toBe('[]')
  expect(localStorage.getItem('daily-progress-sentinel')).toBe('untouched')
  expect(localStorage.length).toBe(3)
  await click('Next lesson')
  expect(container.querySelector('h1')?.textContent).toBe('Naked pairs')
  expect(document.activeElement).toBe(container.querySelector('h1'))
  expect(container.querySelector('[role="status"]')?.textContent).toBe('')
  await click('All lessons')
  expect(container.textContent).toContain('1 of 3 completed')
})

it('lets a learner reveal an explanation and retry without marking an unanswered lesson complete', async () => {
  await mount()
  await click('Show explanation')
  expect(container.textContent).toContain('2, 6')
  expect(localStorage.length).toBe(0)
  await click('Try again')
  expect(container.querySelector('[role="status"]')?.textContent).toBe('')
  expect(container.querySelector('[aria-label="Keep 8"]')?.getAttribute('aria-pressed')).toBe('true')
})

it('keeps exercises usable when saving completion is blocked', async () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('Storage blocked') })
  await mount(); await click('Keep 8'); await click('Check answer')
  expect(container.querySelector('[role="status"]')?.textContent).toContain('Lesson complete')
  expect(container.textContent).toContain('could not save')
})

it('offers a way back for an unknown lesson link', async () => {
  await mount('/learn/sudoku/missing')
  expect(container.textContent).toContain('Lesson not found')
  expect(container.querySelector('a')?.getAttribute('href')).toBe('/learn')
})

it('counts only known, distinct completed lessons from browser storage', async () => {
  localStorage.setItem('daily-puzzles:sudoku-lessons:v1', JSON.stringify(['pairs', 'pairs', 'unknown', null]))
  await mount('/learn')
  expect(container.textContent).toContain('1 of 3 completed')
  expect(container.querySelectorAll('.lesson-completed')).toHaveLength(1)
})
