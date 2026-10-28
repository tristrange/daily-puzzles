// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import queen from '../../../conformance/hint-cases/2026-05-11.puzzle.json'
import star from '../../../conformance/hint-cases/2026-10-08-star.puzzle.json'
import small from '../../../conformance/id-cases/tracks-small.accept.json'
import medium from '../../../conformance/id-cases/tracks-medium.accept.json'
import large from '../../../conformance/id-cases/tracks-large.accept.json'
import words from '../../../conformance/word-paths/2026-10-14-words.json'
import trio from '../../../conformance/schema-cases/trio.accept.json'
import sudoku from '../data/sudoku-previews.json'
import killerEasy from '../../public/puzzles/2026-10-21-killer-sudoku-easy.json'
import killerMedium from '../../public/puzzles/2026-10-21-killer-sudoku-medium.json'
import killerHard from '../../public/puzzles/2026-10-21-killer-sudoku-hard.json'
import { createSudokuGame } from '../domain/sudoku'
import { storeSudokuProgress } from '../lib/sudokuProgress'
import tents from '../../../conformance/schema-cases/tents.accept.json'
import nurikabe from '../../../conformance/schema-cases/nurikabe.accept.json'
import { PUZZLE_TYPES } from '../domain/board'
import { parsePuzzle, isSudokuPuzzle, isNurikabePuzzle } from '../domain/puzzle'
import { createNurikabeGame } from '../domain/nurikabe'
import { storeNurikabeProgress } from '../lib/nurikabeProgress'
import { marksBoard } from '../domain/helpers'
import { createGame } from '../domain/game'
import { createTracksGame } from '../domain/tracksGame'
import { createWordGame } from '../domain/wordGame'
import { createTrioGame, type TrioGrid } from '../domain/trio'
import { createTentsGame, type TentsGrid } from '../domain/tents'
import type { TrackGrid } from '../domain/tracks'
import type { WordGrid } from '../domain/wordPaths'
import { storeMarksProgress } from '../lib/marksProgress'
import { storeTrackProgress } from '../lib/trackProgress'
import { storeWordProgress } from '../lib/wordProgress'
import { storeTrioProgress } from '../lib/trioProgress'
import { storeTentsProgress } from '../lib/tentsProgress'
import { STATS_STORAGE_KEY } from '../lib/stats'
import { puzzleIdsForDay } from '../domain/dates'
import { HomePage } from './HomePage'

const data = [queen, star, small, medium, large, words, trio, tents, nurikabe, ...sudoku.map(board => ({ id: `2026-10-21-sudoku-${board.level}`, type: 'sudoku', seed: 1, generatorVersion: 1, board: { size: 9, level: board.level, givens: board.givens } })), killerEasy, killerMedium, killerHard]
  .map(raw => ({ ...raw, id: raw.id.replace(/^\d{4}-\d{2}-\d{2}/, '2026-10-21') }))
const puzzles = data.map(parsePuzzle)
let container: HTMLDivElement, root: Root
beforeEach(() => {
  vi.setSystemTime(new Date(2026, 9, 21, 12))
  localStorage.clear()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('fetch', async (url: string) => {
    const raw = data.find(puzzle => url.endsWith(`/${puzzle.id}.json`))
    return new Response(JSON.stringify(raw ?? null), { status: raw ? 200 : 404 })
  })
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  localStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function saveAttempts() {
  storeMarksProgress(puzzles[0]!.id, createGame(marksBoard(puzzles[0]!)), { elapsedMs: 272000 })
  storeMarksProgress(puzzles[1]!.id, createGame(marksBoard(puzzles[1]!)), { elapsedMs: 65000 })
  for (const [index, puzzle] of puzzles.slice(2, 5).entries()) {
    storeTrackProgress(puzzle.id, createTracksGame(puzzle.board as TrackGrid), { elapsedMs: (index + 1) * 60000 })
  }
  storeWordProgress(puzzles[5]!.id, createWordGame(puzzles[5]!.board as WordGrid), { elapsedMs: 90000 })
  storeTrioProgress(puzzles[6]!.board as TrioGrid, createTrioGame(puzzles[6]!.board as TrioGrid), { elapsedMs: 125000 }, true)
  storeTentsProgress(puzzles[7]!.board as TentsGrid, createTentsGame(puzzles[7]!.board as TentsGrid), { elapsedMs: 180000 }, 0, true)
  for (const puzzle of puzzles.filter(isSudokuPuzzle)) storeSudokuProgress(puzzle.board, createSudokuGame(puzzle.board), { elapsedMs: 245000 }, 2, true)
  const nurikabePuzzle = puzzles.find(isNurikabePuzzle)
  if (!nurikabePuzzle) throw Error('Nurikabe fixture required')
  storeNurikabeProgress(nurikabePuzzle.board, createNurikabeGame(nurikabePuzzle.board), { elapsedMs: 60000 }, 0, true)
}

async function render() {
  await act(async () => {
    root.render(<MemoryRouter><HomePage /></MemoryRouter>)
    await vi.dynamicImportSettled()
  })
  await act(async () => { await vi.dynamicImportSettled() })
}
const link = (label: string) => container.querySelector(`a[aria-label="${label}"]`)

it('groups games with multiple daily puzzles after single-puzzle games', async () => {
  await render()
  const titles = [...container.querySelectorAll('.game-card-title')].map(title => title.textContent)
  expect(titles).toEqual([
    'Queens', 'Star Battle', 'Word Paths', 'Trio', 'Tents', 'Nurikabe',
    'Train Tracks', 'Sudoku', 'Killer Sudoku',
  ])
})

it('offers each saved daily game with its validated time and original destination', async () => {
  saveAttempts()
  await render()
  for (const [name, time, id] of [['Queens', '4:32', '2026-10-21'], ['Star Battle', '1:05', '2026-10-21-star'],
    ['Train Tracks Small', '1:00', '2026-10-21-tracks-small'], ['Train Tracks Medium', '2:00', '2026-10-21-tracks-medium'],
    ['Train Tracks Large', '3:00', '2026-10-21-tracks-large'], ['Word Paths', '1:30', '2026-10-21-words'],
    ['Trio', '2:05', '2026-10-21-trio'], ['Tents', '3:00', '2026-10-21-tents'], ['Nurikabe', '1:00', '2026-10-21-nurikabe'],
    ...['Easy', 'Medium', 'Hard'].map(level => [`Sudoku ${level}`, '4:05', `2026-10-21-sudoku-${level.toLowerCase()}`]),
    ...['Easy', 'Medium', 'Hard'].map(level => [`Killer Sudoku ${level}`, '4:05', `2026-10-21-killer-sudoku-${level.toLowerCase()}`])]) {
    expect(link(`Resume ${name} at ${time}`)?.getAttribute('href')).toBe(`/archive/${id}`)
    const card = link(`Resume ${name} at ${time}`)?.closest('.game-card')
    expect(card?.textContent).toContain(`In progress · ${time}`)
  }
})

it('keeps sizes independent and completed results take priority over saved replays', async () => {
  saveAttempts()
  localStorage.removeItem('daily-puzzles.track-progress.2026-10-21-tracks-medium')
  localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify([puzzles[0]!, puzzles[4]!].map(puzzle => ({
    id: puzzle.id, puzzleType: puzzle.puzzleType, size: puzzle.board.width, elapsedMs: 60000, hints: 0, solvedAt: Date.now(),
  }))))
  await render()
  expect(link('Resume Train Tracks Small at 1:00')).not.toBeNull()
  expect(link('Play Train Tracks Medium')).not.toBeNull()
  expect(link('Play Train Tracks Large again')?.textContent).toContain('Completed')
  expect(link('Play Queens again')?.textContent).toContain('Play again')
  expect(link('Resume Queens at 4:32')).toBeNull()
})

it('ignores stale saves and blocked storage instead of advertising a broken resume', async () => {
  saveAttempts()
  for (const key of Object.keys(localStorage)) {
    localStorage.setItem(key, JSON.stringify({ ...JSON.parse(localStorage.getItem(key)!), board: 'old board' }))
  }
  await render()
  expect(container.querySelectorAll('.game-card')).toHaveLength(PUZZLE_TYPES.length)
  expect(container.textContent).not.toContain('Resume')
  expect(container.querySelector('a[href*="/preview/"]')).toBeNull()
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw Error('Storage disabled') })
  await act(async () => root.unmount())
  root = createRoot(container)
  await render()
  expect(container.querySelectorAll('.game-card')).toHaveLength(PUZZLE_TYPES.length)
  expect(container.textContent).not.toContain('Resume')
})

it('offers a valid zero-time save without confusing it with a missing attempt', async () => {
  storeMarksProgress(puzzles[0]!.id, createGame(marksBoard(puzzles[0]!)), { elapsedMs: 0 })
  await render()
  expect(link('Resume Queens at 0:00')).not.toBeNull()
  expect(link('Play Star Battle')).not.toBeNull()
})

it('counts individual available puzzles and excludes unavailable variants even if they were solved', async () => {
  const unavailable = puzzles[3]!
  vi.stubGlobal('fetch', async (url: string) => {
    if (url.endsWith(`/${unavailable.id}.json`)) return new Response(null, { status: 503 })
    const raw = data.find(puzzle => url.endsWith(`/${puzzle.id}.json`))
    return new Response(JSON.stringify(raw ?? null), { status: raw ? 200 : 404 })
  })
  localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify([puzzles[0]!, puzzles[4]!, unavailable].map(puzzle => ({
    id: puzzle.id, puzzleType: puzzle.puzzleType, size: puzzle.board.width, elapsedMs: 60000, hints: 0, solvedAt: Date.now(),
  }))))
  await render()
  const published = data.filter(puzzle => puzzleIdsForDay('2026-10-21').includes(puzzle.id)).length - 1
  expect(container.querySelector('.today-progress')?.textContent).toContain(`2 of ${published} available puzzles completed`)
  expect(published).toBe(14)
  expect(container.querySelector('progress')?.getAttribute('value')).toBe('2')
  expect(container.querySelector('progress')?.getAttribute('max')).toBe(String(published))
  expect(container.textContent).toContain('Not saved — connect to load.')
})

it('refreshes saved attempts and solved results when a page is restored or another tab changes them', async () => {
  await render()
  const fetchSpy = vi.spyOn(globalThis, 'fetch')
  storeMarksProgress(puzzles[0]!.id, createGame(marksBoard(puzzles[0]!)), { elapsedMs: 90000 })
  await act(async () => {
    window.dispatchEvent(new Event('pageshow'))
    await vi.dynamicImportSettled()
  })
  expect(link('Resume Queens at 1:30')).not.toBeNull()

  localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify([{
    id: puzzles[0]!.id, puzzleType: puzzles[0]!.puzzleType, size: puzzles[0]!.board.width,
    elapsedMs: 90000, hints: 0, solvedAt: Date.now(),
  }]))
  await act(async () => {
    window.dispatchEvent(new Event('storage'))
    await vi.dynamicImportSettled()
  })
  expect(link('Play Queens again')).not.toBeNull()
  expect(container.querySelector('.today-progress')?.textContent).toContain('1 of ')
  expect(fetchSpy).not.toHaveBeenCalled()
})

it('shows a saved attempt after returning from a puzzle', async () => {
  await act(async () => {
    root.render(<MemoryRouter><Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/archive/:id" element={<Link to="/">Back to Today</Link>} />
    </Routes></MemoryRouter>)
    await vi.dynamicImportSettled()
  })
  await act(async () => { await vi.dynamicImportSettled() })
  await act(async () => { container.querySelector<HTMLAnchorElement>('a[aria-label="Play Queens"]')!.click() })
  storeMarksProgress(puzzles[0]!.id, createGame(marksBoard(puzzles[0]!)), { elapsedMs: 90000 })
  await act(async () => {
    container.querySelector<HTMLAnchorElement>('a[href="/"]')!.click()
    await vi.dynamicImportSettled()
  })
  await act(async () => { await vi.dynamicImportSettled() })
  expect(link('Resume Queens at 1:30')).not.toBeNull()
})

it('updates availability after reconnecting, without counting unavailable puzzles', async () => {
  let offline = true
  vi.stubGlobal('fetch', async (url: string) => {
    if (offline) throw Error('Offline')
    const raw = data.find(puzzle => url.endsWith(`/${puzzle.id}.json`))
    return new Response(JSON.stringify(raw ?? null), { status: raw ? 200 : 404 })
  })
  await render()
  expect(container.querySelector('.today-progress')?.textContent).toBe('No puzzles available right now.')
  expect(container.querySelector('progress')).toBeNull()
  offline = false
  await act(async () => {
    window.dispatchEvent(new Event('online'))
    await vi.dynamicImportSettled()
  })
  expect(container.querySelector('.today-progress')?.textContent).toContain('0 of 15 available puzzles completed')
  expect(link('Play Queens')).not.toBeNull()
})
