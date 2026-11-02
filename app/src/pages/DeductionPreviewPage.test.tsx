// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { previewDeduction } from '../domain/dailyDeduction'
import { previousPuzzleIds } from '../domain/dates'
import { sudokuDigits } from '../domain/sudoku'
import { DeductionPreviewPage } from './DeductionPreviewPage'

const clock = vi.hoisted(() => ({ day: '2026-11-02' }))
vi.mock('../lib/useToday', () => ({ useToday: () => clock.day }))

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  clock.day = '2026-11-02'
  localStorage.clear()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  localStorage.clear()
})

async function render() {
  await act(async () => root.render(<MemoryRouter><DeductionPreviewPage /></MemoryRouter>))
}

async function click(name: string) {
  const button = [...container.querySelectorAll<HTMLButtonElement>('button')]
    .find(item => item.getAttribute('aria-label') === name || item.textContent === name)
  if (!button) throw Error(`Missing button: ${name}`)
  await act(async () => button.click())
}

it('rotates through nine advanced positions by calendar day', () => {
  const days = previousPuzzleIds('2026-11-10', 9)
  const lessons = days.map(previewDeduction)
  expect(new Set(lessons.map(lesson => lesson.id)).size).toBe(9)
  expect(new Set(lessons.map(lesson => lesson.techniqueId))).toEqual(new Set(['x-wing', 'xy-wing', 'swordfish']))
  for (const lesson of lessons) expect(sudokuDigits(lesson.step.before & ~lesson.step.after)).toHaveLength(1)
  expect(previewDeduction('2026-11-11').id).toBe(previewDeduction('2026-11-02').id)
})

it('checks a deduction and explains it without changing puzzle or lesson progress', async () => {
  await render()
  const lesson = previewDeduction(clock.day)
  expect(container.textContent).not.toContain(lesson.title)
  await click('Check answer')
  expect(container.textContent).toContain('does not match the deduction this preview checks')
  for (const digit of sudokuDigits(lesson.step.before & ~lesson.step.after)) await click(`Keep ${digit}`)
  expect(container.querySelector(`[data-cell="${lesson.step.cell}"]`)?.getAttribute('aria-label'))
    .toContain(`notes ${sudokuDigits(lesson.step.after).join(', ')}`)
  await click('Check answer')
  expect(container.textContent).toContain('Correct!')
  expect(container.textContent).toContain(lesson.title)
  expect(container.querySelector(`a[href="/learn/sudoku/${lesson.id}"]`)).not.toBeNull()
  expect(localStorage.length).toBe(0)
})

it('shows a clue and explanation without claiming a correct answer', async () => {
  await render()
  const lesson = previewDeduction(clock.day)
  await click('Show a clue')
  expect(container.textContent).toContain(lesson.cue)
  await click('Show explanation')
  expect(container.textContent).toContain(lesson.step.reason)
  expect(container.textContent).not.toContain('Correct!')
  await click('Try again')
  expect(container.textContent).not.toContain(lesson.step.reason)
})

it('starts the new day with a fresh position while the page stays open', async () => {
  await render()
  await click('Show explanation')
  const earlier = previewDeduction(clock.day)
  clock.day = '2026-11-03'
  await render()
  expect(container.textContent).not.toContain(earlier.step.reason)
  expect(container.querySelector('[data-hint="target"]')?.getAttribute('data-cell'))
    .toBe(String(previewDeduction(clock.day).step.cell))
})
