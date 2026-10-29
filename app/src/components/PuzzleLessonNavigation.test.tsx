// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import queens from '../../public/puzzles/2026-10-27.json'
import star from '../../public/puzzles/2026-10-27-star.json'
import tracks from '../../public/puzzles/2026-10-27-tracks-large.json'
import words from '../../public/puzzles/2026-10-27-words.json'
import trio from '../../public/puzzles/2026-10-27-trio.json'
import tents from '../../public/puzzles/2026-10-27-tents.json'
import sudoku from '../../public/puzzles/2026-10-27-sudoku-hard.json'
import nurikabe from '../../public/puzzles/2026-10-27-nurikabe.json'
import killer from '../../public/puzzles/2026-10-27-killer-sudoku-hard.json'
import { createGame } from '../domain/game'
import { marksBoard } from '../domain/helpers'
import { parsePuzzle } from '../domain/puzzle'
import { readMarksProgress, storeMarksProgress } from '../lib/marksProgress'
import { loadPuzzle } from '../lib/puzzles'
import { QueensCoursePage, QueensLessonPage } from '../pages/QueensLessonPages'
import { LessonLayout } from './LessonLayout'
import { PuzzleView } from './PuzzleView'

vi.mock('../lib/useLeaderboard', () => ({ useLeaderboard: () => ({ offerSolve: vi.fn(), status: 'disabled' }) }))
vi.mock('../lib/puzzles', async importOriginal => ({ ...await importOriginal<typeof import('../lib/puzzles')>(), loadPuzzle: vi.fn() }))

let container: HTMLDivElement, root: Root
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount()); container.remove()
  localStorage.clear(); sessionStorage.clear(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals()
})

const cases = [
  { raw: queens, label: 'Queens', path: '/learn/queens' },
  { raw: star, label: 'Star Battle', path: '/learn/star-battle' },
  { raw: tracks, label: 'Train Tracks', path: '/learn/train-tracks' },
  { raw: trio, label: 'Trio', path: '/learn/trio' },
  { raw: tents, label: 'Tents', path: '/learn/tents' },
  { raw: sudoku, label: 'Sudoku', path: '/learn/sudoku' },
  { raw: nurikabe, label: 'Nurikabe', path: '/learn/nurikabe' },
  { raw: killer, label: 'Killer Sudoku', path: '/learn/killer-sudoku' },
  { raw: words, label: 'Word Paths', path: null },
] as const

it.each(cases)('offers the appropriate lesson link for $label', async ({ raw, label, path }) => {
  const puzzle = parsePuzzle(raw)
  vi.mocked(loadPuzzle).mockResolvedValue(puzzle)
  await act(async () => root.render(<MemoryRouter initialEntries={[`/archive/${puzzle.id}`]}><PuzzleView id={puzzle.id} /></MemoryRouter>))
  const lesson = container.querySelector<HTMLAnchorElement>(`a[aria-label="Learn ${label} techniques"]`)
  if (path === null) expect(lesson).toBeNull()
  else {
    expect(lesson?.getAttribute('href')).toBe(path)
    expect(lesson?.getAttribute('target')).toBeNull()
  }
  expect(container.querySelector(`a[aria-label^="${label} rules"]`)).not.toBeNull()
})

it('returns to the same puzzle from an exercise without counting lesson time', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  let now = 0
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  const puzzle = parsePuzzle(queens), board = marksBoard(puzzle)
  storeMarksProgress(puzzle.id, { ...createGame(board), marks: new Set([0]) }, { elapsedMs: 1200 }, 2)
  vi.mocked(loadPuzzle).mockResolvedValue(puzzle)
  await act(async () => root.render(<MemoryRouter initialEntries={[`/archive/${puzzle.id}?page=2`]}><Routes>
    <Route path="/archive/:id" element={<><Link to="/learn/queens">Browse lessons</Link><PuzzleView id={puzzle.id} /></>} />
    <Route element={<LessonLayout />}>
      <Route path="/learn/queens" element={<QueensCoursePage />} />
      <Route path="/learn/queens/:lessonId" element={<QueensLessonPage />} />
    </Route>
  </Routes></MemoryRouter>))
  now = 1000; await act(async () => vi.advanceTimersByTime(1000))
  await act(async () => container.querySelector<HTMLAnchorElement>('[aria-label="Learn Queens techniques"]')!.click())
  expect(container.querySelector('h1')?.textContent).toBe('Queens techniques')
  const stopped = readMarksProgress(puzzle.id, board)!
  expect(stopped.elapsedMs).toBe(2200)
  expect(stopped.hints).toBe(2)
  expect(stopped.game.marks.has(0)).toBe(true)

  now += 30_000; await act(async () => vi.advanceTimersByTime(30_000))
  await act(async () => container.querySelector<HTMLAnchorElement>('.lesson-exercise-links a')!.click())
  const back = container.querySelector<HTMLAnchorElement>('.lesson-return a')!
  expect(back.getAttribute('href')).toBe(`/archive/${puzzle.id}?page=2`)
  await act(async () => back.click())
  expect(readMarksProgress(puzzle.id, board)?.elapsedMs).toBe(2200)
  expect(container.querySelector('[data-cell="0"]')?.getAttribute('aria-label')).toContain('marked')
  now += 1000; await act(async () => vi.advanceTimersByTime(1000))
  expect(readMarksProgress(puzzle.id, board)?.elapsedMs).toBe(3200)

  await act(async () => [...container.querySelectorAll('a')].find(link => link.textContent === 'Browse lessons')!.click())
  expect(container.querySelector('.lesson-return')).toBeNull()
})

it('returns to the original Star Battle puzzle from the today shortcut', async () => {
  const puzzle = parsePuzzle(star)
  vi.mocked(loadPuzzle).mockResolvedValue(puzzle)
  await act(async () => root.render(<MemoryRouter initialEntries={['/star-battle']}><Routes>
    <Route path="/star-battle" element={<PuzzleView id={puzzle.id} />} />
    <Route element={<LessonLayout />}><Route path="/learn/star-battle" element={<p>Lessons</p>} /></Route>
  </Routes></MemoryRouter>))
  await act(async () => container.querySelector<HTMLAnchorElement>('[aria-label="Learn Star Battle techniques"]')!.click())
  expect(container.querySelector('.lesson-return a')?.getAttribute('href')).toBe(`/archive/${puzzle.id}`)
})

it('restores a return link after reloading a lesson and rejects unrelated destinations', async () => {
  sessionStorage.setItem('daily-puzzles:lesson-return', '/archive/2026-10-27-tracks-large?page=3')
  await act(async () => root.render(<MemoryRouter initialEntries={['/learn/queens']}><Routes>
    <Route element={<LessonLayout />}><Route path="/learn/queens" element={<p>Lessons</p>} /></Route>
  </Routes></MemoryRouter>))
  expect(container.querySelector('.lesson-return a')?.getAttribute('href')).toBe('/archive/2026-10-27-tracks-large?page=3')
  await act(async () => root.unmount()); root = createRoot(container)
  sessionStorage.setItem('daily-puzzles:lesson-return', 'https://example.com/')
  await act(async () => root.render(<MemoryRouter initialEntries={['/learn/queens']}><Routes>
    <Route element={<LessonLayout />}><Route path="/learn/queens" element={<p>Lessons</p>} /></Route>
  </Routes></MemoryRouter>))
  expect(container.querySelector('.lesson-return')).toBeNull()
})
