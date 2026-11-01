// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { GRID_LESSONS, GRID_TECHNIQUES, type GridLesson } from '../domain/gridLessons'
import { KILLER_LESSONS } from '../domain/killerLessons'
import { KILLER_FORTY_FIVE_LESSONS, fortyFiveExcluded } from '../domain/killerFortyFiveLessons'
import { killerCombinations } from '../domain/killerSudoku'
import { QUEENS_LESSONS, QUEENS_TECHNIQUES } from '../domain/queensLessons'
import { STAR_BATTLE_TECHNIQUES } from '../domain/starBattleLessons'
import { STAR_BATTLE_CHAINS } from '../domain/starBattleChains'
import { sudokuDigits } from '../domain/sudoku'
import { SUDOKU_TECHNIQUES } from '../domain/sudokuLessons'
import { TRIO_TECHNIQUES } from '../domain/trioLessons'
import { GridCoursePage, GridLessonPage } from './GridLessonPages'
import { KillerCoursePage, KillerLessonPage } from './KillerLessonPages'
import { LearnPage } from './LearnPage'
import { QueensCoursePage, QueensLessonPage } from './QueensLessonPages'
import { StarBattleCoursePage } from './StarBattleCoursePage'
import { StarBattleLessonPage } from './StarBattleLessonPage'
import { SudokuCoursePage } from './SudokuCoursePage'
import { SudokuLessonPage } from './SudokuLessonPage'
import { TrioCoursePage } from './TrioCoursePage'
import { TrioLessonPage } from './TrioLessonPage'

let container: HTMLDivElement, root: Root
beforeEach(() => {
  localStorage.clear(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); localStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

const ids = (items: readonly { id: string }[]) => items.map(item => item.id)
const save = (key: string, items: readonly { id: string }[]) => localStorage.setItem(`daily-puzzles:${key}-lessons:v1`, JSON.stringify(ids(items)))
async function mount(path: string) {
  await act(async () => root.render(<MemoryRouter key={path} initialEntries={[path]}><Routes>
    <Route path="/learn" element={<LearnPage />} />
    <Route path="/learn/sudoku" element={<SudokuCoursePage />} /><Route path="/learn/sudoku/:lessonId" element={<SudokuLessonPage />} />
    <Route path="/learn/trio" element={<TrioCoursePage />} /><Route path="/learn/trio/:lessonId" element={<TrioLessonPage />} />
    <Route path="/learn/star-battle" element={<StarBattleCoursePage />} /><Route path="/learn/star-battle/:lessonId" element={<StarBattleLessonPage />} />
    <Route path="/learn/queens" element={<QueensCoursePage />} /><Route path="/learn/queens/:lessonId" element={<QueensLessonPage />} />
    <Route path="/learn/killer-sudoku" element={<KillerCoursePage />} /><Route path="/learn/killer-sudoku/:lessonId" element={<KillerLessonPage />} />
    {(['nurikabe', 'tents', 'train-tracks'] as const).map(kind => <Route key={kind}>
      <Route path={`/learn/${kind}`} element={<GridCoursePage kind={kind} />} />
      <Route path={`/learn/${kind}/:lessonId`} element={<GridLessonPage kind={kind} />} />
    </Route>)}
  </Routes></MemoryRouter>))
}
async function click(name: string) {
  const element = [...container.querySelectorAll<HTMLElement>('button, a')].find(item => item.textContent?.trim() === name || item.getAttribute('aria-label') === name)
  expect(element, name).toBeDefined(); await act(async () => element!.click())
}
async function chooseCell(cell: number) {
  const element = container.querySelector<HTMLElement>(`[data-cell="${cell}"]`)
  expect(element).not.toBeNull(); await act(async () => element!.click())
}
const feedback = () => container.querySelector('.lesson-feedback')?.textContent ?? ''

it('recognizes existing complete techniques across all courses and refreshes when history changes', async () => {
  save('queens', QUEENS_LESSONS.filter(lesson => lesson.technique === QUEENS_TECHNIQUES[0]!.id))
  save('sudoku', [...SUDOKU_TECHNIQUES[4]!.exercises, SUDOKU_TECHNIQUES[1]!.exercises[0]!])
  save('killer-sudoku', [...KILLER_LESSONS, ...KILLER_FORTY_FIVE_LESSONS])
  save('star-battle', [...STAR_BATTLE_TECHNIQUES[0]!.exercises, ...STAR_BATTLE_CHAINS])
  save('trio', TRIO_TECHNIQUES[2]!.exercises)
  for (const kind of ['nurikabe', 'tents', 'train-tracks'] as const) {
    save(kind, GRID_LESSONS.filter(lesson => lesson.kind === kind && lesson.technique === GRID_TECHNIQUES[kind][0].id))
  }
  localStorage.setItem('daily-progress-sentinel', 'untouched')
  await mount('/learn')
  expect(container.querySelector('.learning-overview')?.textContent).toContain('10 of 32 techniques practiced')
  expect(container.textContent).toContain('not included in Stats backups')
  for (const [kind, count] of [['queens', 1], ['sudoku', 1], ['killer-sudoku', 2], ['star-battle', 2], ['trio', 1], ['nurikabe', 1], ['tents', 1], ['train-tracks', 1]] as const) {
    await mount(`/learn/${kind}`)
    expect(container.querySelectorAll('.technique-practiced'), kind).toHaveLength(count)
  }
  await mount('/learn')
  localStorage.removeItem('daily-puzzles:queens-lessons:v1')
  await act(async () => window.dispatchEvent(new Event('pageshow')))
  expect(container.querySelector('.learning-overview')?.textContent).toContain('9 of 32 techniques practiced')
  expect(localStorage.getItem('daily-progress-sentinel')).toBe('untouched')
})

it('awards a technique only after a correct saved answer, even when exercises are completed out of order', async () => {
  const technique = SUDOKU_TECHNIQUES[4]!, lesson = technique.exercises[0]!
  save('sudoku', technique.exercises.slice(1))
  await mount(`/learn/sudoku/${lesson.id}`)
  await click('Show explanation')
  expect(feedback()).not.toContain('practiced!')
  await click('Try again')
  for (const digit of sudokuDigits(lesson.step.before & ~lesson.step.after)) await click(`Keep ${digit}`)
  await click('Check answer')
  expect(feedback()).toContain(`${technique.title} practiced!`)
  await click('Try again')
  for (const digit of sudokuDigits(lesson.step.before & ~lesson.step.after)) await click(`Keep ${digit}`)
  await click('Check answer')
  expect(feedback()).not.toContain('practiced!')
})

it('does not announce an achievement when saving completion fails', async () => {
  const technique = SUDOKU_TECHNIQUES[0]!, lesson = technique.exercises[0]!
  save('sudoku', technique.exercises.slice(1))
  await mount(`/learn/sudoku/${lesson.id}`)
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('blocked') })
  for (const digit of sudokuDigits(lesson.step.before & ~lesson.step.after)) await click(`Keep ${digit}`)
  await click('Check answer')
  expect(feedback()).toContain('Lesson complete')
  expect(feedback()).not.toContain('practiced!')
  expect(container.textContent).toContain('could not save')
})

it.each(['nurikabe', 'tents', 'train-tracks'] as const)('awards the final checked %s exercise', async kind => {
  const technique = GRID_TECHNIQUES[kind][0]
  const siblings = GRID_LESSONS.filter(lesson => lesson.kind === kind && lesson.technique === technique.id)
  const lesson = siblings[0]!
  save(kind, siblings.slice(1))
  await mount(`/learn/${kind}/${lesson.id}`)
  await chooseCell(lesson.answers[0]!.cell); await click('Check answer')
  expect(feedback()).toContain(`${technique.title} practiced!`)
})

it('awards a completed Queens technique', async () => {
  const technique = QUEENS_TECHNIQUES[0]!, siblings = QUEENS_LESSONS.filter(lesson => lesson.technique === technique.id), lesson = siblings[0]!
  save('queens', siblings.slice(1))
  await mount(`/learn/queens/${lesson.id}`)
  await chooseCell(lesson.answers[0]!); await click('Check answer')
  expect(feedback()).toContain(`${technique.title} practiced!`)
})

it('awards a completed Trio technique after editing the board', async () => {
  const technique = TRIO_TECHNIQUES[2]!, lesson = technique.exercises[0]!, target = lesson.examples[0]!.cell
  save('trio', technique.exercises.slice(1))
  await mount(`/learn/trio/${lesson.id}`)
  const cell = container.querySelector<HTMLElement>(`[data-cell="${target}"]`)!
  await act(async () => cell.focus())
  await act(async () => cell.dispatchEvent(new KeyboardEvent('keydown', { key: String(lesson.goal.remove), bubbles: true })))
  await click('Check answer')
  expect(feedback()).toContain(`${technique.title} practiced!`)
})

it('awards regular and chained Star Battle techniques', async () => {
  const technique = STAR_BATTLE_TECHNIQUES[0]!, lesson = technique.exercises[0]!
  save('star-battle', [...technique.exercises.slice(1), ...STAR_BATTLE_CHAINS.slice(1)])
  await mount(`/learn/star-battle/${lesson.id}`)
  await click(lesson.hint.action === 'queen' ? 'Place a star' : 'Mark X'); await click('Check answer')
  expect(feedback()).toContain(`${technique.title} practiced!`)
  const chain = STAR_BATTLE_CHAINS[0]!
  await mount(`/learn/star-battle/${chain.id}`)
  const cell = container.querySelector<HTMLElement>(`[data-cell="${chain.answers[0]}"]`)!
  await act(async () => cell.dispatchEvent(new MouseEvent('pointerdown', { button: 0, bubbles: true })))
  await click('Check answer')
  expect(feedback()).toContain('From reservation to stars practiced!')
})

it('awards both Killer Sudoku techniques', async () => {
  const lesson = KILLER_LESSONS[0]!, cage = lesson.board.cages[lesson.cageIndex]!
  save('killer-sudoku', [...KILLER_LESSONS.slice(1), ...KILLER_FORTY_FIVE_LESSONS.slice(1)])
  await mount(`/learn/killer-sudoku/${lesson.id}`)
  const forbidden = lesson.forbidden.reduce((mask, digit) => mask | (1 << (digit - 1)), 0)
  for (const mask of killerCombinations(cage).filter(mask => mask & forbidden)) await click(`Cross out ${sudokuDigits(mask).join(' + ')}`)
  await click('Check answer')
  expect(feedback()).toContain('Compare cage combinations practiced!')
  const advanced = KILLER_FORTY_FIVE_LESSONS[0]!
  await mount(`/learn/killer-sudoku/${advanced.id}`)
  for (const mask of fortyFiveExcluded(advanced)) await click(`Cross out ${sudokuDigits(mask).join(' + ')}`)
  await click('Check answer')
  expect(feedback()).toContain('The 45 rule practiced!')
})

it.each(['nurikabe', 'tents', 'train-tracks'] as const)('has a visible technique for every %s exercise', (kind: GridLesson['kind']) => {
  const techniques = GRID_TECHNIQUES[kind]
  const lessons = GRID_LESSONS.filter(lesson => lesson.kind === kind)
  expect(techniques.every(technique => lessons.some(lesson => lesson.technique === technique.id))).toBe(true)
  expect(lessons.every(lesson => techniques.some(technique => technique.id === lesson.technique))).toBe(true)
})
