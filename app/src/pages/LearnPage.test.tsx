// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { STATS_STORAGE_KEY } from '../lib/stats'
import { SUDOKU_LESSONS } from '../domain/sudokuLessons'
import { sudokuDigits } from '../domain/sudoku'
import { LearnPage } from './LearnPage'
import { SudokuLessonPage } from './SudokuLessonPage'
import { SudokuCoursePage } from './SudokuCoursePage'

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
      <Route path="/learn/sudoku" element={<SudokuCoursePage />} />
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
  await click('Next exercise')
  expect(container.querySelector('h1')?.textContent).toBe('Locked candidates')
  expect(document.activeElement).toBe(container.querySelector('h1'))
  expect(container.querySelector('[role="status"]')?.textContent).toBe('')
  await click('All techniques')
  expect(container.textContent).toContain('1 of 21 completed')
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
  expect(container.querySelector('a')?.getAttribute('href')).toBe('/learn/sudoku')
})

it('counts only known, distinct completed lessons from browser storage', async () => {
  localStorage.setItem('daily-puzzles:sudoku-lessons:v1', JSON.stringify(['pairs', 'pairs', 'unknown', null]))
  await mount('/learn/sudoku')
  expect(container.textContent).toContain('1 of 21 completed')
  expect(container.querySelectorAll('.lesson-completed')).toHaveLength(1)
})

it.each([
  { id: 'hidden-pairs', target: '63', supports: ['65'], remove: [3, 5, 7, 9], remaining: '2, 8' },
  { id: 'naked-triples', target: '34', supports: ['16', '52', '79'], remove: [1, 3], remaining: '2, 6' },
])('lets learners reveal, retry and complete $id with its full pattern visible', async lesson => {
  await mount(`/learn/sudoku/${lesson.id}`)
  expect(container.querySelector('[data-hint="target"]')?.getAttribute('data-cell')).toBe(lesson.target)
  expect([...container.querySelectorAll('[data-hint="support"]')].map(cell => cell.getAttribute('data-cell'))).toEqual(lesson.supports)
  await click('Show explanation')
  expect(container.querySelector('[role="status"]')?.textContent).toContain(lesson.remaining)
  expect(localStorage.length).toBe(0)
  expect(container.querySelectorAll('fieldset:disabled')).toHaveLength(1)
  await click('Try again')
  expect(container.querySelector('[role="status"]')?.textContent).toBe('')
  await click('Check answer')
  expect(container.querySelector('[role="status"]')?.textContent).toContain('Not quite')
  for (const digit of lesson.remove) await click(`Keep ${digit}`)
  await click('Check answer')
  expect(container.querySelector('[role="status"]')?.textContent).toContain('Lesson complete')
  expect(container.querySelector(`[data-cell="${lesson.target}"]`)?.getAttribute('aria-label')).toContain(`notes ${lesson.remaining}`)
  expect(JSON.parse(localStorage.getItem('daily-puzzles:sudoku-lessons:v1') ?? 'null')).toEqual([lesson.id])
})

it('preserves old completion IDs and groups 21 exercises into seven technique cards', async () => {
  localStorage.setItem('daily-puzzles:sudoku-lessons:v1', JSON.stringify(['locked-candidates', 'pairs', 'x-wing']))
  await mount('/learn/sudoku')
  expect(container.textContent).toContain('3 of 21 completed')
  expect(container.querySelectorAll('.lesson-completed')).toHaveLength(3)
  expect(container.querySelectorAll('.lesson-exercise-links a')).toHaveLength(21)
  expect([...container.querySelectorAll('.lesson-progress')].map(progress => progress.textContent)).toEqual(['1 of 3 completed', '1 of 3 completed', '0 of 3 completed', '0 of 3 completed', '1 of 3 completed', '0 of 3 completed', '0 of 3 completed'])
  expect(container.querySelectorAll('.lesson-cards li')).toHaveLength(7)
})


it('keeps practice clues optional across checking, retrying and sibling navigation', async () => {
  await mount('/learn/sudoku/locked-candidates-2')
  expect(container.textContent).toContain('Exercise 2 of 3')
  expect(container.querySelector('[data-hint="target"]')?.getAttribute('data-cell')).toBe('45')
  expect(container.querySelectorAll('[data-hint="support"]')).toHaveLength(0)
  expect(container.querySelector('.lesson-cue')).toBeNull()
  expect(container.querySelectorAll('.lesson-siblings a')).toHaveLength(3)
  await click('Show a clue')
  expect(container.querySelectorAll('[data-hint="support"]')).toHaveLength(2)
  expect(container.querySelector('.lesson-cue')).not.toBeNull()
  await click('Check answer')
  expect(container.querySelector('[role="status"]')?.textContent).toContain('Not quite')
  expect(container.querySelector('.lesson-cue')).not.toBeNull()
  await click('Show explanation')
  expect(localStorage.length).toBe(0)
  await click('Try again')
  expect(container.querySelectorAll('[data-hint="support"]')).toHaveLength(0)
  expect(container.querySelector('.lesson-cue')).toBeNull()
  await click('Keep 4'); await click('Check answer')
  expect(container.querySelector('[role="status"]')?.textContent).toContain('Lesson complete')
  expect(container.querySelectorAll('[data-hint="support"]')).toHaveLength(2)
  expect(JSON.parse(localStorage.getItem('daily-puzzles:sudoku-lessons:v1') ?? 'null')).toEqual(['locked-candidates-2'])
  await click('Next exercise')
  expect(container.textContent).toContain('Exercise 3 of 3')
  expect(container.querySelector('[role="status"]')?.textContent).toBe('')
  expect(container.querySelectorAll('[data-hint="support"]')).toHaveLength(0)
  await click('Show explanation')
  expect(container.querySelector('[aria-label="Next exercise"]')).toBeNull()
  expect(container.textContent).toContain('Try a full Sudoku')
  await click('Exercise 1')
  expect(container.textContent).toContain('Exercise 1 of 3')
  expect(container.querySelectorAll('[data-hint="support"]')).toHaveLength(2)
  expect(container.querySelector('[role="status"]')?.textContent).toBe('')
})


it.each(['xy-wing-2', 'swordfish-2'])('lets learners practice %s without spoiling the pattern', async id => {
  const lesson = SUDOKU_LESSONS.find(item => item.id === id)!
  await mount(`/learn/sudoku/${id}`)
  expect(container.querySelectorAll('[data-hint="support"]')).toHaveLength(0)
  await click('Show a clue')
  expect(container.querySelectorAll('[data-hint="support"]')).toHaveLength(lesson.support.length)
  await click('Show explanation')
  expect(localStorage.length).toBe(0)
  await click('Try again')
  expect(container.querySelectorAll('[data-hint="support"]')).toHaveLength(0)
  await click('Check answer')
  expect(container.querySelector('[role="status"]')?.textContent).toContain('Not quite')
  for (const digit of sudokuDigits(lesson.step.before & ~lesson.step.after)) await click(`Keep ${digit}`)
  await click('Check answer')
  expect(container.querySelector('[role="status"]')?.textContent).toContain('Lesson complete')
  expect(JSON.parse(localStorage.getItem('daily-puzzles:sudoku-lessons:v1') ?? 'null')).toEqual([id])
})
