// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { STAR_BATTLE_LESSONS } from '../domain/starBattleLessons'
import { STAR_BATTLE_CHAINS } from '../domain/starBattleChains'
import { LearnPage } from './LearnPage'
import { SudokuCoursePage } from './SudokuCoursePage'
import { StarBattleCoursePage } from './StarBattleCoursePage'
import { StarBattleLessonPage } from './StarBattleLessonPage'

const KEY = 'daily-puzzles:star-battle-lessons:v1'
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
async function mount(url = '/learn') {
  await act(async () => root.render(<MemoryRouter initialEntries={[url]}><Routes>
    <Route path="/learn" element={<LearnPage />} />
    <Route path="/learn/sudoku" element={<SudokuCoursePage />} />
    <Route path="/learn/star-battle" element={<StarBattleCoursePage />} />
    <Route path="/learn/star-battle/:lessonId" element={<StarBattleLessonPage />} />
  </Routes></MemoryRouter>))
}
function control(name: string): HTMLElement {
  const control = [...container.querySelectorAll<HTMLElement>('button, a')].find(el => el.textContent?.trim() === name || el.getAttribute('aria-label') === name)
  if (!control) throw Error(`Missing control ${name}`)
  return control
}
async function click(name: string) { await act(async () => control(name).click()) }

it('shows only available games and preserves context through both course links', async () => {
  localStorage.setItem('daily-puzzles:sudoku-lessons:v1', JSON.stringify(['pairs', 'pairs', null, 'unknown']))
  localStorage.setItem(KEY, JSON.stringify(['star-battle-fill', 'star-battle-fill', 'unknown', null]))
  await mount()
  expect(container.querySelectorAll('.lesson-cards li')).toHaveLength(7)
  expect([...container.querySelectorAll('.lesson-cards h2')].map(el => el.textContent)).toEqual(['Queens', 'Sudoku', 'Star Battle', 'Trio', 'Nurikabe', 'Tents', 'Train Tracks'])
  const cards = [...container.querySelectorAll('.lesson-cards > li')]
  expect(cards.find(card => card.querySelector('h2')?.textContent === 'Sudoku')?.textContent).toContain('1 of 21 completed')
  expect(cards.find(card => card.querySelector('h2')?.textContent === 'Star Battle')?.textContent).toContain('1 of 15 completed')
  await click('Learn Sudoku →')
  expect(container.querySelectorAll('.lesson-cards li')).toHaveLength(7)
  expect(container.textContent).toContain('from locked candidates through XY-Wing and Swordfish')
  await click('← All games'); await click('Learn Star Battle →')
  expect(container.querySelectorAll('.lesson-cards li')).toHaveLength(5)
  expect(container.querySelectorAll('.lesson-exercise-links a')).toHaveLength(15)
  expect([...container.querySelectorAll('.lesson-cards h2')].map(el => el.textContent)).toEqual(['Last space', 'Fill remaining spaces', 'Locked spaces', 'Group reservation', 'From reservation to stars'])
  expect(container.querySelectorAll('.lesson-completed')).toHaveLength(1)
  expect(container.textContent).toContain('two stars')
  expect(container.textContent).toContain('More involved')
})

it.each(STAR_BATTLE_LESSONS.filter(lesson => lesson.exerciseNumber === 1))('requires deliberate correct checking for $id and leaves other game storage intact', async lesson => {
  localStorage.setItem('daily-progress-sentinel', 'unchanged')
  localStorage.setItem('daily-puzzles:sudoku-lessons:v1', '["pairs"]')
  await mount(`/learn/star-battle/${lesson.id}`)
  expect(control('Check answer').hasAttribute('disabled')).toBe(true)
  expect(control('Place a star').getAttribute('aria-pressed')).toBe('false')
  expect(control('Mark X').getAttribute('aria-pressed')).toBe('false')
  expect(container.querySelector('[data-hint="target"]')?.getAttribute('data-cell')).toBe(String(lesson.hint.cell))
  expect(container.querySelector('.lesson-cue')).not.toBeNull()
  expect(container.textContent).toContain('Stars and crosses are prepared')
  const target = container.querySelector(`[data-cell="${lesson.hint.cell}"]`)
  expect(target?.getAttribute('aria-label')).toContain('empty')
  await click(lesson.hint.action === 'queen' ? 'Mark X' : 'Place a star'); await click('Check answer')
  expect(container.querySelector('[role="status"]')?.textContent).toContain('Not quite')
  expect(localStorage.getItem(KEY)).toBeNull()
  await click('Show explanation')
  expect(container.querySelector('fieldset')?.disabled).toBe(true)
  expect(container.querySelector('.lesson-explanation')?.textContent).toContain(lesson.explanation)
  expect(target?.getAttribute('aria-label')).toContain(lesson.hint.action === 'queen' ? 'star' : 'marked')
  expect(localStorage.getItem(KEY)).toBeNull()
  await click('Try again')
  expect(control('Check answer').hasAttribute('disabled')).toBe(true)
  expect(target?.getAttribute('aria-label')).toContain('empty')
  await click(lesson.hint.action === 'queen' ? 'Place a star' : 'Mark X'); await click('Check answer')
  expect(container.querySelector('[role="status"]')?.textContent).toContain('Lesson complete')
  expect(JSON.parse(localStorage.getItem(KEY) ?? 'null')).toEqual([lesson.id])
  expect(localStorage.getItem('daily-progress-sentinel')).toBe('unchanged')
  expect(localStorage.getItem('daily-puzzles:sudoku-lessons:v1')).toBe('["pairs"]')
})

it('resets answer, reveal and optional clues on retry and sibling navigation', async () => {
  await mount('/learn/star-battle/star-battle-subset-2')
  expect(container.querySelectorAll('[data-hint="support"]')).toHaveLength(0)
  expect(container.querySelector('.lesson-evidence')).toBeNull()
  await click('Show a clue')
  expect(container.querySelector('.lesson-evidence')?.textContent).toContain('6 more stars')
  expect(container.querySelector('.lesson-evidence > p')?.textContent).toContain('row 6 and row 7 and row 8')
  expect(container.querySelectorAll('[data-hint="support"]').length).toBeGreaterThan(0)
  await click('Show explanation'); await click('Try again')
  expect(container.querySelector('.lesson-evidence')).toBeNull()
  expect(control('Check answer').hasAttribute('disabled')).toBe(true)
  await click('Mark X'); await click('Check answer'); await click('Next exercise')
  expect(container.textContent).toContain('Exercise 3 of 3')
  expect(container.querySelector('[role="status"]')?.textContent).toBe('')
  expect(container.querySelector('.lesson-evidence')).toBeNull()
  expect(control('Check answer').hasAttribute('disabled')).toBe(true)
  expect(document.activeElement).toBe(container.querySelector('h1'))
  await click('Show explanation')
  expect(container.querySelector('[aria-label="Next exercise"]')).toBeNull()
  expect(container.querySelector('.lesson-explanation a')?.getAttribute('href')).toBe('/learn/star-battle')
  await click('Exercise 1')
  expect(container.querySelector('.lesson-cue')).not.toBeNull()
  await click('All Star Battle techniques')
  expect(container.textContent).toContain('1 of 15 completed')
})

it('unions completions saved since mount and shows storage failure without losing current feedback', async () => {
  await mount('/learn/star-battle/star-battle-fill')
  localStorage.setItem(KEY, '["star-battle-last-space"]')
  await click('Place a star'); await click('Check answer')
  expect(JSON.parse(localStorage.getItem(KEY) ?? 'null')).toEqual(['star-battle-last-space', 'star-battle-fill'])
  await click('Next exercise')
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('blocked') })
  await click('Place a star'); await click('Check answer')
  expect(container.querySelector('[role="status"]')?.textContent).toContain('Lesson complete')
  expect(container.textContent).toContain('could not save')
})

it('handles invalid lesson links and malformed saved progress', async () => {
  localStorage.setItem(KEY, '{bad JSON')
  await mount('/learn/star-battle/unknown')
  expect(container.textContent).toContain('Lesson not found')
  expect(container.querySelector('a')?.getAttribute('href')).toBe('/learn/star-battle')
  await click('All Star Battle techniques')
  expect(container.textContent).toContain('0 of 15 completed')
})

it('lets practice find either forced star, keeps clues optional, and saves only a checked answer', async () => {
  const lesson = STAR_BATTLE_CHAINS[1]!
  localStorage.setItem(KEY, '["star-battle-fill"]')
  localStorage.setItem('daily-progress-sentinel', 'unchanged')
  await mount(`/learn/star-battle/${lesson.id}`)
  expect(container.querySelectorAll('[data-hint], [data-selected]')).toHaveLength(0)
  expect(container.querySelector('.lesson-cue')).toBeNull()
  expect(control('Check answer').hasAttribute('disabled')).toBe(true)
  const choose = async (cell: number) => act(async () => {
    container.querySelector<HTMLElement>(`[data-cell="${cell}"]`)!.dispatchEvent(new MouseEvent('pointerdown', { button: 0, bubbles: true }))
  })
  await choose(lesson.first.cell); await click('Check answer')
  expect(container.querySelector('[role="status"]')?.textContent).toContain('Not quite')
  expect(localStorage.getItem(KEY)).toBe('["star-battle-fill"]')
  await act(async () => container.querySelector<HTMLElement>(`[data-cell="${lesson.first.cell}"]`)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })))
  expect(container.querySelector('[data-selected]')?.getAttribute('data-cell')).toBe(String(lesson.first.cell + 1))
  await click('Show explanation')
  expect(container.querySelector('.lesson-explanation')?.textContent).toContain(lesson.reasons[0])
  expect(localStorage.getItem(KEY)).toBe('["star-battle-fill"]')
  await click('Try again')
  expect(container.querySelectorAll('[data-hint], [data-selected]')).toHaveLength(0)
  for (const answer of lesson.answers) {
    await choose(answer); await click('Check answer')
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Lesson complete')
    expect(container.querySelector(`[data-cell="${answer}"]`)?.getAttribute('aria-label')).toContain('star')
    await click('Try again')
  }
  expect(JSON.parse(localStorage.getItem(KEY) ?? 'null')).toEqual(['star-battle-fill', lesson.id])
  expect(localStorage.getItem('daily-progress-sentinel')).toBe('unchanged')
  await click('Show a clue')
  expect(container.querySelector('[data-hint="target"]')).not.toBeNull()
})
