// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { GRID_LESSONS } from '../domain/gridLessons'
import { GridCoursePage, GridLessonPage } from './GridLessonPages'

let container: HTMLDivElement, root: Root
beforeEach(() => {
  localStorage.clear(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); localStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

it.each(['nurikabe', 'tents'] as const)('checks an unassisted %s lesson and keeps daily progress separate', async kind => {
  const lessons = GRID_LESSONS.filter(lesson => lesson.kind === kind), lesson = lessons[2]!
  localStorage.setItem('daily-progress-sentinel', 'unchanged')
  await act(async () => root.render(<MemoryRouter initialEntries={[`/learn/${kind}/${lesson.id}`]}><Routes>
    <Route path={`/learn/${kind}/:lessonId`} element={<GridLessonPage kind={kind} />} />
    <Route path={`/learn/${kind}`} element={<GridCoursePage kind={kind} />} />
  </Routes></MemoryRouter>))
  const button = (text: string) => [...container.querySelectorAll<HTMLButtonElement>('button')].find(element => element.textContent?.trim() === text)!
  const choose = async (cell: number) => act(async () => container.querySelector<HTMLButtonElement>(`[data-cell="${cell}"]`)!.click())
  const click = async (text: string) => act(async () => button(text).click())
  expect(container.querySelectorAll('[data-hint], [data-selected]')).toHaveLength(0)
  expect(button('Check answer').disabled).toBe(true)
  await choose(lesson.state.findIndex((_, cell) => !lesson.answers.some(answer => answer.cell === cell)))
  await click('Check answer')
  expect(container.querySelector('[role="status"]')?.textContent).toContain('Not quite')
  expect(localStorage.getItem(`daily-puzzles:${kind}-lessons:v1`)).toBeNull()
  await click('Show explanation')
  expect(container.querySelector('.lesson-explanation')?.textContent).toContain('Why it works')
  expect(localStorage.getItem(`daily-puzzles:${kind}-lessons:v1`)).toBeNull()
  await click('Try again')
  expect(container.querySelectorAll('[data-hint], [data-selected]')).toHaveLength(0)
  await choose(lesson.answers.at(-1)!.cell); await click('Check answer')
  expect(container.querySelector('[role="status"]')?.textContent).toContain('Lesson complete')
  expect(JSON.parse(localStorage.getItem(`daily-puzzles:${kind}-lessons:v1`) ?? 'null')).toEqual([lesson.id])
  expect(localStorage.getItem('daily-progress-sentinel')).toBe('unchanged')
})
