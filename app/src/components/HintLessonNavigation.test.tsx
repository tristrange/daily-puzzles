// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import raw from '../data/sudoku-previews.json'
import playtest from '../domain/fixtures/sudoku-hard-playtest.json'
import starRaw from '../../public/puzzles/2026-09-26-star.json'
import { parseSudokuBoards } from '../domain/sudoku'
import { marksBoard } from '../domain/helpers'
import { createGame } from '../domain/game'
import { parsePuzzle } from '../domain/puzzle'
import { readMarksProgress, storeMarksProgress } from '../lib/marksProgress'
import { readSudokuProgress, storeSudokuProgress } from '../lib/sudokuProgress'
import { SudokuPreviewPage } from '../pages/SudokuPreviewPage'
import { SudokuLessonPage } from '../pages/SudokuLessonPage'
import { StarBattleLessonPage } from '../pages/StarBattleLessonPage'
import { LessonLayout } from './LessonLayout'
import { PuzzleStage } from './PuzzleView'

const board = parseSudokuBoards(raw)[2]!
const game = { cells: playtest.cells.flat(), notes: playtest.notes.flat().map(text =>
  [...text].reduce((mask, digit) => mask | (1 << (Number(digit) - 1)), 0)) }
let container: HTMLDivElement, root: Root

beforeEach(() => {
  localStorage.clear(); sessionStorage.clear()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  HTMLElement.prototype.scrollIntoView = vi.fn()
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount()); container.remove()
  localStorage.clear(); sessionStorage.clear(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals()
})

it('opens the matching lesson and returns to the same preview without losing progress or counting lesson time', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  let now = 0
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  storeSudokuProgress(board, game, { elapsedMs: 1200 }, 2)
  await act(async () => root.render(<MemoryRouter initialEntries={['/preview/sudoku?board=3']}><Routes>
    <Route path="/preview/sudoku" element={<SudokuPreviewPage />} />
    <Route element={<LessonLayout />}><Route path="/learn/sudoku/:lessonId" element={<SudokuLessonPage />} /></Route>
  </Routes></MemoryRouter>))
  now = 1000; await act(async () => vi.advanceTimersByTime(1000))
  const hintButton = container.querySelector<HTMLButtonElement>('[aria-label="Get an explained hint"]')!
  await act(async () => hintButton.click())
  const practice = [...container.querySelectorAll<HTMLAnchorElement>('.hint-panel a')].find(link => link.textContent?.includes('locked candidates'))!
  expect(practice.getAttribute('href')).toBe('/learn/sudoku/locked-candidates')
  expect(readSudokuProgress(board)?.hints).toBe(3)
  await act(async () => practice.click())
  expect(container.querySelector('h1')?.textContent).toBe('Locked candidates')
  expect(readSudokuProgress(board)?.elapsedMs).toBe(2200)
  now += 30_000; await act(async () => vi.advanceTimersByTime(30_000))
  const back = container.querySelector<HTMLAnchorElement>('.lesson-return a')!
  expect(back.getAttribute('href')).toBe('/preview/sudoku?board=3')
  await act(async () => back.click())
  expect(readSudokuProgress(board)).toMatchObject({ game, elapsedMs: 2200, hints: 3 })
  expect(container.querySelector<HTMLSelectElement>('#sudoku-level')?.value).toBe('3')
  expect(container.querySelector('.hint-panel')?.textContent).toContain('locked candidates')
  await act(async () => [...container.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'Apply move')!.click())
  expect(readSudokuProgress(board)?.game.notes[59]).toBe(79)
  expect(readSudokuProgress(board)?.hints).toBe(3)
  await act(async () => [...container.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'Undo')!.click())
  expect(readSudokuProgress(board)?.game).toEqual(game)
  now += 1000; await act(async () => vi.advanceTimersByTime(1000))
  expect(readSudokuProgress(board)?.elapsedMs).toBe(3200)
})

it('does not restore a stale hint if the puzzle changed while the lesson was open', async () => {
  storeSudokuProgress(board, game, { elapsedMs: 1200 }, 2)
  await act(async () => root.render(<MemoryRouter initialEntries={['/preview/sudoku?board=3']}><Routes>
    <Route path="/preview/sudoku" element={<SudokuPreviewPage />} />
    <Route element={<LessonLayout />}><Route path="/learn/sudoku/:lessonId" element={<SudokuLessonPage />} /></Route>
  </Routes></MemoryRouter>))
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Get an explained hint"]')!.click())
  await act(async () => container.querySelector<HTMLAnchorElement>('.hint-lesson a')!.click())
  const changed = { ...game, notes: game.notes.map((mask, cell) => cell === 59 ? mask ^ 1 : mask) }
  storeSudokuProgress(board, changed, { elapsedMs: 1200 }, 3)
  await act(async () => container.querySelector<HTMLAnchorElement>('.lesson-return a')!.click())
  expect(readSudokuProgress(board)?.game).toEqual(changed)
  expect(readSudokuProgress(board)?.hints).toBe(3)
  expect(container.querySelector('.hint-panel')).toBeNull()
})

it('does not offer a lesson link when the browser cannot save the puzzle', async () => {
  storeSudokuProgress(board, game, { elapsedMs: 1200 }, 2)
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('blocked') })
  await act(async () => root.render(<MemoryRouter initialEntries={['/preview/sudoku?board=3']}><SudokuPreviewPage /></MemoryRouter>))
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Get an explained hint"]')!.click())
  expect(container.querySelector('.hint-panel')).not.toBeNull()
  expect(container.querySelector('.hint-lesson a')).toBeNull()
  expect(container.textContent).toContain('Progress can’t be saved')
})

it('restores a daily Star Battle hint and its archive page without counting it again', async () => {
  const puzzle = parsePuzzle(starRaw), starBoard = marksBoard(puzzle)
  storeMarksProgress(puzzle.id, createGame(starBoard), { elapsedMs: 5000 }, 2)
  await act(async () => root.render(<MemoryRouter initialEntries={[`/archive/${puzzle.id}?page=4`]}><Routes>
    <Route path="/archive/:id" element={<PuzzleStage puzzle={puzzle} board={starBoard} timeZone="UTC" />} />
    <Route element={<LessonLayout />}><Route path="/learn/star-battle/:lessonId" element={<StarBattleLessonPage />} /></Route>
  </Routes></MemoryRouter>))
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Get an explained hint"]')!.click())
  expect(readMarksProgress(puzzle.id, starBoard)?.hints).toBe(3)
  await act(async () => container.querySelector<HTMLAnchorElement>('.hint-lesson a')!.click())
  const back = container.querySelector<HTMLAnchorElement>('.lesson-return a')!
  expect(back.getAttribute('href')).toBe(`/archive/${puzzle.id}?page=4`)
  await act(async () => back.click())
  expect(container.querySelector('.hint-panel')?.textContent).toContain('group reservations')
  await act(async () => [...container.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'Apply move')!.click())
  expect(readMarksProgress(puzzle.id, starBoard)?.game.marks.has(51)).toBe(true)
  expect(readMarksProgress(puzzle.id, starBoard)?.hints).toBe(3)
})
