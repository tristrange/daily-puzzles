// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { QUEENS_LESSONS } from '../domain/queensLessons'
import { QueensCoursePage, QueensLessonPage } from './QueensLessonPages'

let container: HTMLDivElement, root: Root
beforeEach(() => {
  localStorage.clear(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); localStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

it.each(['pair', 'chain', 'squeeze'])('checks %s practice without affecting daily play', async technique => {
  const lesson = QUEENS_LESSONS.find(item => item.technique === technique && item.guidance === 'practice')!
  localStorage.setItem('daily-progress-sentinel', 'unchanged')
  await act(async () => root.render(<MemoryRouter initialEntries={[`/learn/queens/${lesson.id}`]}><Routes>
    <Route path="/learn/queens/:lessonId" element={<QueensLessonPage />} /><Route path="/learn/queens" element={<QueensCoursePage />} />
  </Routes></MemoryRouter>))
  const button = (text: string) => [...container.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.trim() === text)!
  const choose = async (cell: number) => act(async () => container.querySelector<HTMLElement>(`[data-cell="${cell}"]`)!.click())
  const click = async (text: string) => act(async () => button(text).click())
  expect(container.querySelectorAll('[data-hint], [data-selected]')).toHaveLength(0)
  expect(button('Check answer').disabled).toBe(true)
  await choose(Array.from({ length: lesson.board.cellCount }, (_, cell) => cell).find(cell => !lesson.answers.includes(cell))!)
  await click('Check answer')
  expect(container.querySelector('[role="status"]')?.textContent).toContain('Not quite')
  await click('Show explanation')
  expect(localStorage.getItem('daily-puzzles:queens-lessons:v1')).toBeNull()
  await click('Try again')
  expect(container.querySelectorAll('[data-hint], [data-selected]')).toHaveLength(0)
  const target = lesson.answers.at(-1)!
  await choose(target); await click('Check answer')
  expect(container.querySelector('[role="status"]')?.textContent).toContain('Lesson complete')
  expect(container.querySelector(`[data-cell="${target}"]`)?.getAttribute('aria-label')).toContain(lesson.action === 'queen' ? 'queen' : 'marked')
  for (const cell of lesson.removed) expect(container.querySelector(`[data-cell="${cell}"]`)?.getAttribute('aria-label')).toContain('marked')
  expect(JSON.parse(localStorage.getItem('daily-puzzles:queens-lessons:v1')!)).toEqual([lesson.id])
  expect(localStorage.getItem('daily-progress-sentinel')).toBe('unchanged')
})
