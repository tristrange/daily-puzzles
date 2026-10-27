// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { TRIO_NAMES } from '../domain/trio'
import { trioCandidateNames, trioCellName } from '../domain/trioHints'
import { TRIO_LESSONS, TRIO_TECHNIQUES } from '../domain/trioLessons'
import { readCompletedTrioLessons, storeCompletedTrioLessons } from '../lib/trioLessonProgress'
import { LearnPage } from './LearnPage'
import { TrioCoursePage } from './TrioCoursePage'
import { TrioLessonPage } from './TrioLessonPage'

const KEY = 'daily-puzzles:trio-lessons:v1'
let container: HTMLDivElement, root: Root
beforeEach(() => {
  localStorage.clear(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount()); container.remove(); localStorage.clear()
  Reflect.deleteProperty(document, 'elementFromPoint')
  vi.unstubAllGlobals(); vi.restoreAllMocks()
})
async function mount(url: string) {
  await act(async () => root.render(<MemoryRouter initialEntries={[url]}><Routes>
    <Route path="/learn" element={<LearnPage />} />
    <Route path="/learn/trio" element={<TrioCoursePage />} />
    <Route path="/learn/trio/:lessonId" element={<TrioLessonPage />} />
  </Routes></MemoryRouter>))
}
function control(name: string): HTMLElement {
  const element = [...container.querySelectorAll<HTMLElement>('button, a')].find(el => el.getAttribute('aria-label') === name || el.textContent?.trim() === name)
  if (!element) throw Error(`Missing control ${name}`)
  return element
}
async function click(name: string) { await act(async () => control(name).click()) }
function cell(index: number): HTMLButtonElement { return container.querySelector<HTMLButtonElement>(`[data-cell="${index}"]`)! }
async function select(index: number) { await act(async () => cell(index).click()) }
function status() { return container.querySelector('[role="status"]')?.textContent }
const practice = TRIO_LESSONS.filter(lesson => lesson.guidance === 'practice')
const practiceSamples = TRIO_TECHNIQUES.map(technique => technique.exercises[1]!)
const responseSamples = [TRIO_TECHNIQUES[0]!.exercises[0]!, TRIO_TECHNIQUES[1]!.exercises[2]!, TRIO_TECHNIQUES[2]!.exercises[1]!]

it('adds Trio with three techniques and twelve exercises while retaining separate game completions', async () => {
  localStorage.setItem(KEY, JSON.stringify([TRIO_LESSONS[0]!.id, TRIO_LESSONS[0]!.id, null, 'unknown']))
  localStorage.setItem('daily-puzzles:star-battle-lessons:v1', '["star-battle-fill"]')
  await mount('/learn')
  expect([...container.querySelectorAll('.lesson-cards h2')].map(el => el.textContent)).toEqual(['Queens', 'Sudoku', 'Star Battle', 'Trio', 'Nurikabe', 'Tents', 'Train Tracks'])
  await click('Learn Trio →')
  expect(container.textContent).toContain('1 of 12 completed')
  expect(container.querySelectorAll('.lesson-cards li')).toHaveLength(3)
  expect(container.querySelectorAll('.lesson-exercise-links a')).toHaveLength(12)
  expect(container.querySelectorAll('.lesson-completed')).toHaveLength(1)
  expect(localStorage.getItem('daily-puzzles:star-battle-lessons:v1')).toBe('["star-battle-fill"]')
})

it.each(practiceSamples)('starts $id without any answer, target, support or hidden coordinate cue', async lesson => {
  await mount(`/learn/trio/${lesson.id}`)
  expect(container.querySelectorAll('[data-hint]')).toHaveLength(0)
  expect(container.querySelectorAll('[data-selected]')).toHaveLength(0)
  expect(container.querySelector('.lesson-cue')).toBeNull()
  expect(container.querySelector('.lesson-explanation')).toBeNull()
  expect(container.querySelectorAll('.lesson-candidates button')).toHaveLength(0)
  expect(control('Check answer').hasAttribute('disabled')).toBe(true)
  const task = container.querySelector('.lesson-task')!.textContent!
  expect(task).toContain(`In ${lesson.scope}`)
  for (const example of lesson.examples) expect(task).not.toContain(trioCellName(example.cell))
  expect(document.activeElement).toBe(container.querySelector('h1'))
})

it.each(responseSamples)('checks the named candidate removal for $id and changes the board only after checking', async lesson => {
  const example = lesson.examples.at(-1)!
  localStorage.setItem('daily-progress-sentinel', 'unchanged')
  localStorage.setItem('daily-puzzles:sudoku-lessons:v1', '["pairs"]')
  await mount(`/learn/trio/${lesson.id}`)
  await select(example.cell)
  const before = cell(example.cell).getAttribute('aria-label')
  expect(container.querySelector('[data-selected]')?.getAttribute('data-cell')).toBe(String(example.cell))
  await click('Check answer')
  expect(status()).toContain('Not quite')
  expect(cell(example.cell).getAttribute('aria-label')).toBe(before)
  expect(localStorage.getItem(KEY)).toBeNull()
  await click(`Keep ${TRIO_NAMES[lesson.goal.remove]}`)
  expect(cell(example.cell).getAttribute('aria-label')).toBe(before)
  await click('Check answer')
  expect(status()).toContain('Lesson complete')
  expect(status()).toContain(trioCandidateNames(example.candidates))
  expect(container.querySelector('[data-hint="target"]')?.getAttribute('data-cell')).toBe(String(example.cell))
  expect(container.querySelectorAll('.trio-lesson-reasons li')).toHaveLength(example.reasons.length)
  expect(cell(example.cell).getAttribute('aria-label')).not.toBe(before)
  expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual([lesson.id])
  expect(localStorage.getItem('daily-progress-sentinel')).toBe('unchanged')
  expect(localStorage.getItem('daily-puzzles:sudoku-lessons:v1')).toBe('["pairs"]')
  expect(localStorage.length).toBe(3)
})

it.each(practice[0]!.examples.map(example => ({ lesson: practice[0]!, example })))('accepts an alternative candidate answer at $example.cell in $lesson.id', async ({ lesson, example }) => {
  await mount(`/learn/trio/${lesson.id}`)
  await select(example.cell); await click(`Keep ${TRIO_NAMES[lesson.goal.remove]}`); await click('Check answer')
  expect(status()).toContain('Lesson complete')
  expect(container.querySelector('[data-hint="target"]')?.getAttribute('data-cell')).toBe(String(example.cell))
})

it('rejects removing another displayed candidate and rejects a correct mask in the wrong scope', async () => {
  const lesson = TRIO_TECHNIQUES[2]!.exercises[1]!, example = lesson.examples[0]!
  await mount(`/learn/trio/${lesson.id}`); await select(example.cell)
  const extra = ([1, 2, 3] as const).find(symbol => example.candidates & (1 << (symbol - 1)))!
  await click(`Keep ${TRIO_NAMES[lesson.goal.remove]}`); await click(`Keep ${TRIO_NAMES[extra]}`); await click('Check answer')
  expect(status()).toContain('Not quite')
  expect(localStorage.getItem(KEY)).toBeNull()
  const other = lesson.game.notes.findIndex((mask, index) => mask === 7 && !lesson.examples.some(example => example.cell === index))
  expect(other).toBeGreaterThanOrEqual(0)
  await select(other); await click(`Keep ${TRIO_NAMES[lesson.goal.remove]}`); await click('Check answer')
  expect(status()).toContain('Not quite')
  expect(container.querySelectorAll('[data-hint]')).toHaveLength(0)
})

it('reveals optional clues without selection, and resets clue, response and selection on retry and navigation', async () => {
  const lesson = practice[0]!
  await mount(`/learn/trio/${lesson.id}`)
  await click('Show a clue')
  expect(container.querySelectorAll('[data-hint="target"]')).toHaveLength(1)
  expect(container.querySelectorAll('[data-hint="support"]').length).toBeGreaterThan(0)
  expect(container.querySelectorAll('[data-selected]')).toHaveLength(0)
  expect(container.querySelector('.lesson-explanation')).toBeNull()
  const before = cell(lesson.examples[0]!.cell).getAttribute('aria-label')
  await click('Show explanation')
  expect(status()).toContain('Example shown')
  expect(container.querySelector('fieldset')?.disabled).toBe(true)
  expect(cell(lesson.examples[0]!.cell).getAttribute('aria-label')).not.toBe(before)
  expect(localStorage.getItem(KEY)).toBeNull()
  vi.mocked(window.scrollTo).mockClear()
  await click('Try again')
  expect(window.scrollTo).toHaveBeenCalledWith({ top: 0 })
  expect(container.querySelectorAll('[data-hint], [data-selected]')).toHaveLength(0)
  expect(control('Check answer').hasAttribute('disabled')).toBe(true)
  expect(document.activeElement).toBe(container.querySelector('h1'))
  await click('Show explanation'); await click('Next exercise')
  expect(container.textContent).toContain('Exercise 3 of 4')
  expect(container.querySelectorAll('[data-hint], [data-selected]')).toHaveLength(0)
  expect(status()).toBe('')
  expect(document.activeElement).toBe(container.querySelector('h1'))
  await click('Exercise 1')
  expect(container.querySelectorAll('[data-hint="target"]')).toHaveLength(1)
  expect(container.querySelectorAll('[data-selected]')).toHaveLength(0)
  expect(control('Check answer').hasAttribute('disabled')).toBe(true)
})

it('merges a completion saved by another tab after the exercise mounted', async () => {
  const lesson = practice[0]!, other = TRIO_LESSONS.at(-1)!.id
  await mount(`/learn/trio/${lesson.id}`)
  localStorage.setItem(KEY, JSON.stringify([other]))
  await select(lesson.examples[0]!.cell); await click(`Keep ${TRIO_NAMES[lesson.goal.remove]}`); await click('Check answer')
  expect(readCompletedTrioLessons()).toEqual([lesson.id, other])
})

it('keeps completion usable when saving fails and reads malformed or unavailable storage safely', async () => {
  const lesson = practice[0]!
  localStorage.setItem(KEY, 'not-json'); expect(readCompletedTrioLessons()).toEqual([])
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('Storage blocked') })
  await mount(`/learn/trio/${lesson.id}`); await select(lesson.examples[0]!.cell)
  await click(`Keep ${TRIO_NAMES[lesson.goal.remove]}`); await click('Check answer')
  expect(status()).toContain('Lesson complete')
  expect(container.textContent).toContain('could not save your completion')
  expect(container.textContent).toContain('· Completed')
  expect(storeCompletedTrioLessons([lesson.id])).toBe(false)
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw Error('Storage blocked') })
  expect(readCompletedTrioLessons()).toEqual([])
})

it('allows pointer, virtual click and arrow-key inspection while keeping all daily edit commands locked', async () => {
  const lesson = practice[0]!, index = lesson.examples[0]!.cell
  await mount(`/learn/trio/${lesson.id}`)
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: vi.fn(() => cell(index)) })
  const grid = container.querySelector('[role="grid"]')!
  const pointer = Object.assign(new Event('pointerdown', { bubbles: true }), { button: 0, pointerId: 1, clientX: 1, clientY: 1 })
  await act(async () => cell(index).dispatchEvent(pointer))
  expect(cell(index).getAttribute('data-selected')).toBe('true')
  expect(document.activeElement).toBe(cell(index))
  const snapshot = [...container.querySelectorAll('[role="gridcell"]')].map(el => el.getAttribute('aria-label'))
  for (const key of ['1', '2', '3', 'n', 'Delete', 'Backspace', 'z']) await act(async () => grid.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ctrlKey: key === 'z' })))
  expect([...container.querySelectorAll('[role="gridcell"]')].map(el => el.getAttribute('aria-label'))).toEqual(snapshot)
  await act(async () => grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })))
  const left = Math.floor(index / 9) * 9 + Math.max(0, index % 9 - 1)
  expect(cell(left).getAttribute('data-selected')).toBe('true')
  expect(document.activeElement).toBe(cell(left))
  await select(index)
  expect(cell(index).getAttribute('data-selected')).toBe('true')
  expect(localStorage.length).toBe(0)
})

it('offers a course and full-board link after the last practice', async () => {
  await mount(`/learn/trio/${TRIO_LESSONS.at(-1)!.id}`)
  await click('Show explanation')
  expect(container.querySelector('[aria-label="Next exercise"]')).toBeNull()
  expect(control('Try a full Trio →').getAttribute('href')).toBe('/preview/trio')
  await click('All techniques →')
  expect(container.textContent).toContain('0 of 12 completed')
})

it('shows a useful unknown lesson route', async () => {
  await mount('/learn/trio/unknown')
  expect(container.querySelector('h1')?.textContent).toBe('Lesson not found')
  expect(control('All Trio techniques').getAttribute('href')).toBe('/learn/trio')
})
