// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import queens from '../../public/puzzles/2026-10-27.json'
import sudoku from '../../public/puzzles/2026-10-27-sudoku-hard.json'
import { parsePuzzle } from '../domain/puzzle'
import { loadPuzzle } from '../lib/puzzles'
import { TodayCards } from '../pages/HomePage'
import { PuzzlePage } from '../pages/PuzzlePage'
import { LessonLayout } from './LessonLayout'
import { Shell } from './Shell'

vi.mock('../lib/useLeaderboard', () => ({ useLeaderboard: () => ({ offerSolve: vi.fn(), status: 'disabled' }) }))
vi.mock('../lib/puzzles', async original => ({ ...await original<typeof import('../lib/puzzles')>(), loadPuzzle: vi.fn() }))

const puzzles = [parsePuzzle(queens), parsePuzzle(sudoku)]
let container: HTMLDivElement
let root: Root

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  vi.mocked(loadPuzzle).mockImplementation(async id => {
    const puzzle = puzzles.find(item => item.id === id)
    if (!puzzle) throw Error('Missing puzzle fixture')
    return puzzle
  })
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount()); container.remove()
  localStorage.clear(); sessionStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals()
})

async function render(path = '/') {
  await act(async () => {
    root.render(<MemoryRouter initialEntries={[path]}><Routes><Route element={<Shell />}>
      <Route path="/" element={<TodayCards probes={puzzles.map(puzzle => ({ id: puzzle.id, puzzle }))} solved={new Set()} />} />
      <Route path="/archive" element={<p>Archive</p>} />
      <Route path="/archive/:id" element={<PuzzlePage />} />
      <Route element={<LessonLayout />}><Route path="/learn/queens" element={<p>Queens lessons</p>} /></Route>
    </Route></Routes></MemoryRouter>)
    await vi.dynamicImportSettled()
  })
}

async function click(selector: string) {
  const element = container.querySelector<HTMLElement>(selector)
  if (!element) throw Error(`Missing ${selector}`)
  await act(async () => { element.click(); await vi.dynamicImportSettled() })
}

function currentNav(label: string) {
  return container.querySelector(`nav[aria-label="Main"] a[href="${label}"]`)?.getAttribute('aria-current')
}

it.each(['Play Queens', 'Play Sudoku Hard'])('returns to Today after opening %s', async label => {
  await render()
  await click(`a[aria-label="${label}"]`)
  expect(currentNav('/')).toBe('page')
  expect(currentNav('/archive')).toBeNull()
  expect(container.querySelector('a[aria-label="Today’s puzzles"]')?.getAttribute('href')).toBe('/')
  await click('a[aria-label="Today’s puzzles"]')
  expect(container.querySelector(`a[aria-label="${label}"]`)).not.toBeNull()
})

it('preserves the Today return path through a lesson', async () => {
  await render()
  await click('a[aria-label="Play Queens"]')
  await click('a[aria-label="Learn Queens techniques"]')
  expect(sessionStorage.getItem('daily-puzzles:lesson-return-today')).toBe('true')
  await click('nav[aria-label="Return to puzzle"] a')
  expect(currentNav('/')).toBe('page')
  expect(container.querySelector('a[aria-label="Today’s puzzles"]')?.getAttribute('href')).toBe('/')
})

it('restores the Today return path when a lesson is reloaded', async () => {
  sessionStorage.setItem('daily-puzzles:lesson-return', `/archive/${queens.id}`)
  sessionStorage.setItem('daily-puzzles:lesson-return-today', 'true')
  await render('/learn/queens')
  await click('nav[aria-label="Return to puzzle"] a')
  expect(currentNav('/')).toBe('page')
  expect(container.querySelector('a[aria-label="Today’s puzzles"]')?.getAttribute('href')).toBe('/')
})

it('uses the archive and its original page for a direct puzzle link', async () => {
  await render(`/archive/${queens.id}?page=2`)
  expect(currentNav('/archive')).toBe('page')
  expect(currentNav('/')).toBeNull()
  expect(container.querySelector('a[aria-label="All puzzles"]')?.getAttribute('href')).toBe('/archive?game=queens&page=2')
})
