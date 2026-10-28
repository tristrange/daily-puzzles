// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { KillerCoursePage, KillerLessonPage } from './KillerLessonPages'
import { KILLER_LESSONS } from '../domain/killerLessons'
import { killerCombinations } from '../domain/killerSudoku'
import certificate from '../../../docs/measurements/killer-sudoku-preview.json'

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

it('teaches the combination tool and saves completion separately from puzzle progress', async () => {
  localStorage.setItem('daily-progress-sentinel', 'untouched')
  await mount('/learn/killer-sudoku/cage-combinations')
  expect(container.querySelectorAll('[data-hint="support"]')).toHaveLength(1)
  await click('Check answer')
  expect(container.querySelector('.lesson-feedback[role="status"]')?.textContent).toContain('Not quite')
  await click('Cross out 5 + 8'); await click('Reset combinations')
  expect(container.querySelector('[aria-label="Cross out 5 + 8"]')?.getAttribute('aria-pressed')).toBe('false')
  await click('Cross out 5 + 8'); await click('Check answer')
  expect(container.querySelector('.lesson-feedback[role="status"]')?.textContent).toContain('Lesson complete')
  expect(container.querySelector('.lesson-explanation')?.textContent).toContain('column 1')
  expect(localStorage.getItem('daily-progress-sentinel')).toBe('untouched')
  expect(JSON.parse(localStorage.getItem('daily-puzzles:killer-sudoku-lessons:v1')!)).toEqual(['cage-combinations'])
  await click('Next exercise')
  expect(container.textContent).toContain('Exercise 2 of 3')
  expect(container.querySelectorAll('[data-hint="support"]')).toHaveLength(0)
  await click('Show a clue')
  expect(container.querySelectorAll('[data-hint="support"]')).toHaveLength(1)
  await click('Show explanation')
  expect(JSON.parse(localStorage.getItem('daily-puzzles:killer-sudoku-lessons:v1')!)).toEqual(['cage-combinations'])
  await click('Try again')
  expect(container.querySelector('[aria-label="Cross out 1 + 2 + 4 + 5"]')?.getAttribute('aria-pressed')).toBe('false')
  await click('Cross out 1 + 2 + 4 + 5'); await click('Check answer')
  expect(container.querySelector('.lesson-feedback[role="status"]')?.textContent).toContain('Lesson complete')
})

it.each(KILLER_LESSONS)('$id excludes only combinations contradicted by its highlighted givens', lesson => {
  const cage = lesson.board.cages[lesson.cageIndex]!
  const unit = lesson.id === 'cage-combinations' ? (cell: number) => cell % 9 : (cell: number) => Math.floor(cell / 27) * 3 + Math.floor(cell % 9 / 3)
  expect(cage.cells.every(cell => unit(cell) === unit(cage.cells[0]!))).toBe(true)
  expect(lesson.support.every(cell => unit(cell) === unit(cage.cells[0]!) && !cage.cells.includes(cell))).toBe(true)
  expect(lesson.support.map(cell => lesson.board.givens[cell]).sort()).toEqual([...lesson.forbidden].sort())
  const excluded = lesson.forbidden.reduce((mask, value) => mask | (1 << (value - 1)), 0)
  const combinations = killerCombinations(cage)
  expect(combinations.some(mask => mask & excluded)).toBe(true)
  expect(combinations.some(mask => !(mask & excluded))).toBe(true)
  const solution = certificate.samples.find(sample => sample.id === lesson.board.id)!.solution
  const solutionMask = cage.cells.reduce((mask, cell) => mask | (1 << (solution[cell]! - 1)), 0)
  expect(combinations).toContain(solutionMask)
  expect(solutionMask & excluded).toBe(0)
})
