// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { TRIO_NAMES } from '../domain/trio'
import { TRIO_TECHNIQUES } from '../domain/trioLessons'
import { TrioLessonPage } from './TrioLessonPage'

let container: HTMLDivElement, root: Root
beforeEach(() => {
  localStorage.clear(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); localStorage.clear(); Reflect.deleteProperty(document, 'elementFromPoint'); vi.unstubAllGlobals(); vi.restoreAllMocks() })

async function mount(id: string) {
  await act(async () => root.render(<MemoryRouter initialEntries={[`/learn/trio/${id}`]}><Routes>
    <Route path="/learn/trio/:lessonId" element={<TrioLessonPage />} />
  </Routes></MemoryRouter>))
}
function cell(index: number) { return container.querySelector<HTMLButtonElement>(`[data-cell="${index}"]`)! }
async function press(index: number, key: string) {
  await act(async () => cell(index).focus())
  await act(async () => cell(index).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })))
}
async function click(name: string) {
  const button = [...container.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.trim() === name || item.getAttribute('aria-label') === name)
  expect(button, name).toBeDefined(); await act(async () => button!.click())
}

it('shows notes as they are edited across cells, then checks an answer without discarding the working board', async () => {
  const lesson = TRIO_TECHNIQUES[2]!.exercises[1]!, target = lesson.examples[0]!.cell
  const bit = 1 << (lesson.goal.remove - 1)
  const scratch = lesson.game.notes.findIndex((mask, i) => i !== target && !lesson.examples.some(example => example.cell === i) && !!(mask & bit))
  expect(scratch).toBeGreaterThanOrEqual(0)
  localStorage.setItem('daily-progress-sentinel', 'unchanged')
  await mount(lesson.id)
  const targetBefore = cell(target).getAttribute('aria-label'), scratchBefore = cell(scratch).getAttribute('aria-label')
  await press(target, String(lesson.goal.remove))
  expect(cell(target).getAttribute('aria-label')).not.toBe(targetBefore)
  expect(cell(target).getAttribute('aria-label')).not.toContain(`notes ${TRIO_NAMES[lesson.goal.remove]}`)
  await press(scratch, String(lesson.goal.remove))
  expect(cell(scratch).getAttribute('aria-label')).not.toBe(scratchBefore)
  expect(cell(target).getAttribute('aria-label')).not.toBe(targetBefore)
  await click('Check answer')
  expect(container.querySelector('.lesson-feedback')?.textContent).toContain('Lesson complete')
  expect(cell(scratch).getAttribute('aria-label')).not.toBe(scratchBefore)
  expect(localStorage.getItem('daily-progress-sentinel')).toBe('unchanged')
})

it('places symbols, supports undo and redo, and protects the prepared starting cells', async () => {
  const lesson = TRIO_TECHNIQUES[1]!.exercises[1]!
  const empty = lesson.game.cells.findIndex((value, i) => !value && !lesson.examples.some(example => example.cell === i))
  const prepared = lesson.game.cells.findIndex(value => value !== 0)
  await mount(lesson.id)
  expect(cell(prepared).getAttribute('aria-readonly')).toBe('true')
  const before = cell(empty).getAttribute('aria-label')
  await click('Notes'); await press(empty, '1')
  expect(cell(empty).getAttribute('aria-label')).toContain(', Sun')
  await click('Undo'); expect(cell(empty).getAttribute('aria-label')).toBe(before)
  await click('Redo'); expect(cell(empty).getAttribute('aria-label')).toContain(', Sun')
})

it('undoes a dragged note stroke across multiple cells as one move', async () => {
  const lesson = TRIO_TECHNIQUES[2]!.exercises[1]!, bit = 1 << (lesson.goal.remove - 1)
  const target = lesson.examples[0]!.cell
  const other = lesson.game.notes.findIndex((mask, index) => index !== target && !!(mask & bit))
  const cells = [target, other]
  const [first, second] = cells
  expect(first).toBeGreaterThanOrEqual(0); expect(second).toBeGreaterThanOrEqual(0)
  await mount(lesson.id)
  const before = cells.map(index => cell(index).getAttribute('aria-label'))
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: (x: number) => cell(x === 1 ? first! : second!) })
  const grid = container.querySelector<HTMLElement>('[role="grid"]')!
  Object.defineProperties(grid, { setPointerCapture: { value: vi.fn() }, hasPointerCapture: { value: () => false }, releasePointerCapture: { value: vi.fn() } })
  const pointer = (type: string, x: number) => Object.assign(new Event(type, { bubbles: true }), { button: 0, pointerId: 1, clientX: x, clientY: 1 })
  await act(async () => cell(first!).dispatchEvent(pointer('pointerdown', 1)))
  await click('Check answer')
  expect(localStorage.getItem('daily-puzzles:trio-lessons:v1')).toBeNull()
  await act(async () => grid.dispatchEvent(pointer('pointermove', 2)))
  await act(async () => grid.dispatchEvent(pointer('pointerup', 2)))
  expect(cells.map(index => cell(index).getAttribute('aria-label'))).not.toEqual(before)
  for (const [i, index] of cells.entries()) expect(cell(index).getAttribute('aria-label')).not.toBe(before[i])
  await click('Undo')
  expect(cells.map(index => cell(index).getAttribute('aria-label'))).toEqual(before)
})

it('accepts a placed symbol when the original puzzle proves that further deduction', async () => {
  const options = TRIO_TECHNIQUES[2]!.exercises.flatMap(lesson => lesson.examples.map(example => ({ lesson, example })))
  const found = options.find(({ example }) => [1, 2, 4].includes(example.proven) && example.proven !== example.candidates)
  expect(found).toBeDefined()
  const { lesson, example } = found!, symbol = Math.log2(example.proven) + 1
  await mount(lesson.id)
  await click('Notes'); await press(example.cell, String(symbol)); await click('Check answer')
  expect(container.querySelector('.lesson-feedback')?.textContent).toContain('Lesson complete')
})

it('does not count scratchwork or an explanation as lesson completion', async () => {
  const lesson = TRIO_TECHNIQUES[1]!.exercises[1]!
  const scratch = lesson.game.cells.findIndex((value, i) => !value && !lesson.examples.some(example => example.cell === i) && !!lesson.game.notes[i])
  const bit = [1, 2, 3].find(value => lesson.game.notes[scratch]! & (1 << (value - 1)))!
  await mount(lesson.id)
  await press(scratch, String(bit)); await click('Check answer')
  expect(container.querySelector('.lesson-feedback')?.textContent).toContain('Not quite')
  expect(localStorage.getItem('daily-puzzles:trio-lessons:v1')).toBeNull()
  await click('Show explanation')
  expect(localStorage.getItem('daily-puzzles:trio-lessons:v1')).toBeNull()
  await click('Try again')
  expect(cell(scratch).getAttribute('aria-label')).toContain(`notes ${[1, 2, 3].filter(value => lesson.game.notes[scratch]! & (1 << (value - 1))).map(value => TRIO_NAMES[value as 1 | 2 | 3]).join(', ')}`)
})
