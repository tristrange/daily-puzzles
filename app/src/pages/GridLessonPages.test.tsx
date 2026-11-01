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
  if (lesson.kind === 'train-tracks') throw Error('Expected a grid lesson')
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

it.each(['protect', 'line'])('checks a %s exercise and preserves earlier Tents completion', async technique => {
  const lesson = GRID_LESSONS.find(item => item.kind === 'tents' && item.technique === technique && item.guidance === 'practice')!
  localStorage.setItem('daily-puzzles:tents-lessons:v1', JSON.stringify(['tents-line-arrangements-1']))
  await act(async () => root.render(<MemoryRouter initialEntries={[`/learn/tents/${lesson.id}`]}><Routes>
    <Route path="/learn/tents/:lessonId" element={<GridLessonPage kind="tents" />} />
    <Route path="/learn/tents" element={<GridCoursePage kind="tents" />} />
  </Routes></MemoryRouter>))
  expect(container.querySelectorAll('[data-hint], [data-selected]')).toHaveLength(0)
  expect(container.querySelectorAll('.lesson-siblings a')).toHaveLength(3)
  const answer = lesson.answers[0]!.cell
  await act(async () => container.querySelector<HTMLButtonElement>(`[data-cell="${answer}"]`)!.click())
  const check = [...container.querySelectorAll('button')].find(button => button.textContent === 'Check answer')!
  await act(async () => check.click())
  expect(container.querySelector(`[data-cell="${answer}"]`)?.getAttribute('data-mark')).toBe('2')
  expect(container.querySelector('[role="status"]')?.textContent).toContain('Lesson complete')
  expect(JSON.parse(localStorage.getItem('daily-puzzles:tents-lessons:v1')!)).toEqual(['tents-line-arrangements-1', lesson.id])
})

it.each(['matching', 'matching-count'])('practices %s without revealing the answer or losing prior completion', async technique => {
  const lesson = GRID_LESSONS.find(item => item.kind === 'tents' && item.technique === technique && item.guidance === 'practice')!
  if (lesson.kind !== 'tents') throw Error('Expected Tents')
  localStorage.setItem('daily-puzzles:tents-lessons:v1', JSON.stringify(['tents-line-arrangements-1']))
  await act(async () => root.render(<MemoryRouter initialEntries={[`/learn/tents/${lesson.id}`]}><Routes>
    <Route path="/learn/tents/:lessonId" element={<GridLessonPage kind="tents" />} />
  </Routes></MemoryRouter>))
  expect(container.querySelectorAll('[data-hint], [data-selected]')).toHaveLength(0)
  const answer = lesson.answers.at(-1)!.cell
  await act(async () => container.querySelector<HTMLButtonElement>(`[data-cell="${answer}"]`)!.click())
  const check = [...container.querySelectorAll('button')].find(button => button.textContent === 'Check answer')!
  await act(async () => check.click())
  expect(container.querySelector(`[data-cell="${answer}"]`)?.getAttribute('data-mark')).toBe(String(lesson.value))
  expect(container.querySelector('[role="status"]')?.textContent).toContain('Lesson complete')
  expect(container.querySelector('.lesson-explanation')?.textContent).toContain('remaining set')
  expect(JSON.parse(localStorage.getItem('daily-puzzles:tents-lessons:v1')!)).toEqual(['tents-line-arrangements-1', lesson.id])
})

it.each(['island-shapes', 'connect-land'])('checks a %s exercise and preserves earlier Nurikabe completion', async technique => {
  const lesson = GRID_LESSONS.find(item => item.kind === 'nurikabe' && item.technique === technique && item.guidance === 'practice')!
  localStorage.setItem('daily-puzzles:nurikabe-lessons:v1', JSON.stringify(['nurikabe-sea-connection-1']))
  await act(async () => root.render(<MemoryRouter initialEntries={[`/learn/nurikabe/${lesson.id}`]}><Routes>
    <Route path="/learn/nurikabe/:lessonId" element={<GridLessonPage kind="nurikabe" />} />
    <Route path="/learn/nurikabe" element={<GridCoursePage kind="nurikabe" />} />
  </Routes></MemoryRouter>))
  expect(container.querySelectorAll('[data-hint], [data-selected]')).toHaveLength(0)
  const answer = lesson.answers[0]!.cell
  await act(async () => container.querySelector<HTMLButtonElement>(`[data-cell="${answer}"]`)!.click())
  const check = [...container.querySelectorAll('button')].find(button => button.textContent === 'Check answer')!
  await act(async () => check.click())
  expect(container.querySelector(`[data-cell="${answer}"]`)?.getAttribute('data-mark')).toBe('2')
  expect(container.querySelector('[role="status"]')?.textContent).toContain('Lesson complete')
  expect(JSON.parse(localStorage.getItem('daily-puzzles:nurikabe-lessons:v1')!)).toEqual(['nurikabe-sea-connection-1', lesson.id])
})

it.each(['corridor', 'counts', 'loop', 'edges'])('checks a Train Tracks %s exercise without changing daily progress', async technique => {
  const lesson = GRID_LESSONS.find(item => item.kind === 'train-tracks' && item.technique === technique && item.guidance === 'practice')!
  if (lesson.kind !== 'train-tracks') throw Error('Expected Train Tracks')
  localStorage.setItem('daily-progress-sentinel', 'unchanged')
  await act(async () => root.render(<MemoryRouter initialEntries={[`/learn/train-tracks/${lesson.id}`]}><Routes>
    <Route path="/learn/train-tracks/:lessonId" element={<GridLessonPage kind="train-tracks" />} />
  </Routes></MemoryRouter>))
  expect(container.querySelectorAll('[data-hint], [data-selected]')).toHaveLength(0)
  const answer = lesson.answers.at(-1)!
  await act(async () => container.querySelector<HTMLElement>(`[data-cell="${answer.cell}"]`)!.click())
  const check = [...container.querySelectorAll('button')].find(button => button.textContent === 'Check answer')!
  await act(async () => check.click())
  expect(container.querySelector('[role="status"]')?.textContent).toContain('Lesson complete')
  expect(container.querySelector(`[data-cell="${answer.cell}"]`)?.getAttribute('aria-label')).toContain(answer.brush === 8 ? 'direction not decided' : 'track')
  expect(JSON.parse(localStorage.getItem('daily-puzzles:train-tracks-lessons:v1')!)).toEqual([lesson.id])
  expect(localStorage.getItem('daily-progress-sentinel')).toBe('unchanged')
})
