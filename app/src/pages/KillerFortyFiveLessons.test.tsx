// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { KillerCoursePage, KillerLessonPage } from './KillerLessonPages'

let container: HTMLDivElement, root: Root
beforeEach(() => {
  localStorage.clear(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); localStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

async function mount(url: string) {
  await act(async () => root.render(<MemoryRouter initialEntries={[url]}><Routes>
    <Route path="/learn/killer-sudoku" element={<KillerCoursePage />} />
    <Route path="/learn/killer-sudoku/:lessonId" element={<KillerLessonPage />} />
  </Routes></MemoryRouter>))
}

async function click(name: string) {
  const button = [...container.querySelectorAll<HTMLElement>('button, a')].find(el => el.textContent?.trim() === name || el.getAttribute('aria-label') === name)
  expect(button, name).toBeDefined(); await act(async () => button!.click())
}

it('keeps existing completions and lists the 45 rule as the next technique', async () => {
  localStorage.setItem('daily-puzzles:killer-sudoku-lessons:v1', JSON.stringify(['cage-combinations']))
  await mount('/learn/killer-sudoku')
  expect(container.textContent).toContain('1 of 7 completed')
  expect(container.textContent).toContain('Compare cage combinations')
  expect(container.textContent).toContain('The 45 rule')
  expect(container.querySelector('a[href="/learn/killer-sudoku/rule-of-45-1"]')).not.toBeNull()
})

it('checks a 45-rule deduction and leaves puzzle progress alone', async () => {
  localStorage.setItem('daily-progress-sentinel', 'untouched')
  localStorage.setItem('daily-puzzles:killer-sudoku-lessons:v1', JSON.stringify(['cage-combinations']))
  await mount('/learn/killer-sudoku/rule-of-45-1')
  expect(container.querySelectorAll('[data-hint="support"]').length).toBeGreaterThan(0)
  await click('Cross out 2 + 7 + 8 + 9'); await click('Check answer')
  expect(container.querySelector('.lesson-feedback')?.textContent).toContain('Not quite')
  await click('Reset combinations')
  await click('Cross out 4 + 5 + 8 + 9'); await click('Check answer')
  expect(container.querySelector('.lesson-feedback')?.textContent).toContain('Lesson complete')
  expect(container.querySelector('.lesson-explanation')?.textContent).toContain('45')
  expect(JSON.parse(localStorage.getItem('daily-puzzles:killer-sudoku-lessons:v1')!)).toEqual(['cage-combinations', 'rule-of-45-1'])
  expect(localStorage.getItem('daily-progress-sentinel')).toBe('untouched')
  await click('Next exercise')
  expect(container.textContent).toContain('Exercise 2 of 4')
  expect(container.querySelectorAll('[data-hint="support"]')).toHaveLength(0)
})

it('offers optional highlights and does not record a revealed answer as complete', async () => {
  await mount('/learn/killer-sudoku/rule-of-45-2')
  expect(container.querySelectorAll('[data-hint]')).toHaveLength(0)
  await click('Show a clue')
  expect(container.querySelectorAll('[data-hint="support"]').length).toBeGreaterThan(0)
  await click('Show explanation')
  expect(localStorage.getItem('daily-puzzles:killer-sudoku-lessons:v1')).toBeNull()
  await click('Try again')
  expect(container.querySelectorAll('[data-hint]')).toHaveLength(0)
})

it('keeps the target cage highlighted while navigating the read-only board by keyboard', async () => {
  await mount('/learn/killer-sudoku/rule-of-45-1')
  const target = container.querySelector<HTMLButtonElement>('[data-hint="target"]')!
  const highlighted = [...container.querySelectorAll<HTMLElement>('[data-cage-selected="true"]')].map(cell => cell.dataset['cell'])
  await act(async () => target.focus())
  await act(async () => target.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })))
  expect(document.activeElement?.getAttribute('data-cell')).not.toBe(target.dataset['cell'])
  expect([...container.querySelectorAll<HTMLElement>('[data-cage-selected="true"]')].map(cell => cell.dataset['cell'])).toEqual(highlighted)
})
