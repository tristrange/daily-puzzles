// @vitest-environment jsdom
import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import queen from '@shared/conformance/hint-cases/2026-05-11.puzzle.json'
import star from '@shared/conformance/hint-cases/2026-10-08-star.puzzle.json'
import trioRaw from '../data/trio-previews.json'
import tentsRaw from '../data/tents-previews.json'
import sudokuRaw from '../data/sudoku-previews.json'
import { parsePuzzle, type Puzzle } from '../domain/puzzle'
import { marksBoard } from '../domain/helpers'
import { createGame } from '../domain/game'
import { TrackGrid } from '../domain/tracks'
import { createTracksGame } from '../domain/tracksGame'
import { WordGrid } from '../domain/wordPaths'
import { createWordGame } from '../domain/wordGame'
import { createTrioGame, parseTrioBoard } from '../domain/trio'
import { createTentsGame, parseTentsBoard } from '../domain/tents'
import { createSudokuGame, parseSudokuBoards } from '../domain/sudoku'
import { readMarksProgress, storeMarksProgress } from '../lib/marksProgress'
import { readTrackProgress, storeTrackProgress } from '../lib/trackProgress'
import { readWordProgress, storeWordProgress } from '../lib/wordProgress'
import { readTrioProgress, storeTrioProgress } from '../lib/trioProgress'
import { readTentsProgress, storeTentsProgress } from '../lib/tentsProgress'
import { readSudokuProgress, storeSudokuProgress } from '../lib/sudokuProgress'
import { readStoredStats } from '../lib/stats'
import { PuzzleStage } from './PuzzleView'
import { TracksStage } from './TracksStage'
import { WordPathsStage } from './WordPathsStage'
import { TrioStage } from './TrioStage'
import { TentsStage } from './TentsStage'
import { SudokuStage } from './SudokuStage'

const publication = vi.hoisted(() => ({ offerSolve: vi.fn() }))
vi.mock('../lib/useLeaderboard', () => ({ useLeaderboard: () => ({ offerSolve: publication.offerSolve, status: 'disabled' }) }))
let container: HTMLDivElement, root: Root, now: number, focused: boolean, hidden: boolean
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  now = 0; focused = true; hidden = false
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.spyOn(Date, 'now').mockImplementation(() => 1_790_000_000_000 + now)
  vi.spyOn(document, 'hasFocus').mockImplementation(() => focused)
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden)
  HTMLElement.prototype.scrollIntoView = vi.fn()
  localStorage.clear(); publication.offerSolve.mockClear()
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount()); container.remove(); localStorage.clear()
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals()
})
async function mount(element: ReactElement) { await act(async () => root.render(<MemoryRouter>{element}</MemoryRouter>)) }
async function tick(ms: number) { now += ms; await act(async () => vi.advanceTimersByTime(ms)) }
async function focus(value: boolean) { focused = value; await act(async () => window.dispatchEvent(new Event(value ? 'focus' : 'blur'))) }
async function visible(value: boolean) { hidden = !value; await act(async () => document.dispatchEvent(new Event('visibilitychange'))) }
function marks(raw: unknown) {
  const puzzle = parsePuzzle(raw), board = marksBoard(puzzle)
  storeMarksProgress(puzzle.id, createGame(board), 1200)
  return { element: <PuzzleStage puzzle={puzzle} board={board} timeZone="UTC" />, read: () => readMarksProgress(puzzle.id, board)?.elapsedMs }
}
function tracks() {
  const grid = new TrackGrid(3, 1, [3], [1, 1, 1], [1, 0, 1])
  const puzzle: Puzzle = { id: '2026-10-19-tracks', puzzleType: 'train-tracks', seed: 1, generatorVersion: 1, board: grid, difficulty: null }
  storeTrackProgress(puzzle.id, createTracksGame(grid), 1200)
  return { element: <TracksStage puzzle={puzzle} grid={grid} timeZone="UTC" />, read: () => readTrackProgress(puzzle.id, grid)?.elapsedMs }
}
const cases = [
  { name: 'Queens', setup: () => marks(queen) },
  { name: 'Star Battle', setup: () => marks(star) },
  { name: 'Train Tracks', setup: tracks },
  { name: 'Word Paths', setup: () => {
    const grid = new WordGrid(4, 2, ['C', 'A', 'T', null, 'L', 'I', 'O', 'N'], [3, 4], 2)
    const puzzle: Puzzle = { id: '2026-10-19-words', puzzleType: 'word-paths', seed: 1, generatorVersion: 2, board: grid, difficulty: null }
    storeWordProgress(puzzle.id, createWordGame(grid), 1200)
    return { element: <WordPathsStage puzzle={puzzle} grid={grid} timeZone="UTC" />, read: () => readWordProgress(puzzle.id, grid)?.elapsedMs }
  } },
  { name: 'Trio preview', setup: () => {
    const board = parseTrioBoard(trioRaw[0]); storeTrioProgress(board, createTrioGame(board), 1200)
    return { element: <TrioStage board={board} />, read: () => readTrioProgress(board)?.elapsedMs }
  } },
  { name: 'Tents preview', setup: () => {
    const board = parseTentsBoard(tentsRaw[0]); storeTentsProgress(board, createTentsGame(board), 1200, 0)
    return { element: <TentsStage board={board} />, read: () => readTentsProgress(board)?.elapsedMs }
  } },
  { name: 'Sudoku preview', setup: () => {
    const board = parseSudokuBoards(sudokuRaw)[0]!; storeSudokuProgress(board, createSudokuGame(board), 1200, 0)
    return { element: <SudokuStage board={board} />, read: () => readSudokuProgress(board)?.elapsedMs }
  } },
]

it.each(cases)('$name counts only visible, focused time and resumes its saved duration', async ({ setup }) => {
  const { element, read } = setup(); await mount(element)
  await tick(1000); expect(read()).toBe(2200)
  now += 150; await focus(false); await tick(5000); expect(read()).toBe(2350)
  await visible(false); await focus(true); await tick(1000); expect(read()).toBe(2350)
  await visible(true); await tick(1000); expect(read()).toBe(3350)
  await focus(false); await act(async () => root.unmount()); now += 20_000
  root = createRoot(container); await mount(element); await tick(2000); expect(read()).toBe(3350)
  await focus(true); await tick(1000); expect(read()).toBe(4350)
  expect(container.querySelector('[role="timer"]')?.textContent).toBe('0:04')
})

it.each(['Queens', 'Train Tracks'])('%s records focused time at the solve instant and freezes it', async name => {
  const playing = name === 'Queens' ? marks(queen) : tracks()
  if (name === 'Queens') {
    const puzzle = parsePuzzle(queen), board = marksBoard(puzzle)
    storeMarksProgress(puzzle.id, { board, queens: new Set([3, 5, 12, 19]), marks: new Set() }, 1200)
  }
  await mount(playing.element); await tick(1000)
  await focus(false); await tick(10_000); await focus(true); await tick(650); now += 125
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Get an explained hint"]')!.click())
  await act(async () => container.querySelector<HTMLButtonElement>('.apply-hint')!.click())
  expect(readStoredStats()[0]?.elapsedMs).toBe(2975)
  expect(publication.offerSolve).toHaveBeenCalledExactlyOnceWith(readStoredStats()[0])
  expect(playing.read()).toBeUndefined()
  await tick(10_000)
  expect(container.querySelector('[role="timer"]')?.textContent).toBe('0:02')
  expect(readStoredStats()[0]?.elapsedMs).toBe(2975)
})
