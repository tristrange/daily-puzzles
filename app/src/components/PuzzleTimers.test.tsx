import { Board } from '../domain/board'
import trioProof from '@shared/docs/measurements/trio-pilot.json'
import tentsProof from '@shared/docs/measurements/tents-preview.json'
import sudokuProof from '@shared/docs/measurements/sudoku-preview.json'
import nurikabeProof from '@shared/docs/measurements/nurikabe-preview.json'
// @vitest-environment jsdom
import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import queen from '@shared/conformance/hint-cases/2026-05-11.puzzle.json'
import star from '@shared/conformance/hint-cases/2026-10-08-star.puzzle.json'
import trioRaw from '../data/trio-previews.json'
import tentsRaw from '../data/tents-previews.json'
import nurikabeRaw from '../data/nurikabe-previews.json'
import { createNurikabeGame, parseNurikabeBoards } from '../domain/nurikabe'
import { readNurikabeProgress, storeNurikabeProgress } from '../lib/nurikabeProgress'
import { NurikabeStage } from './NurikabeStage'
import sudokuRaw from '../data/sudoku-previews.json'
import { parsePuzzle, type Puzzle } from '../domain/puzzle'
import { marksBoard } from '../domain/helpers'
import { createGame } from '../domain/game'
import { TrackGrid } from '../domain/tracks'
import { createTracksGame, MAYBE } from '../domain/tracksGame'
import { WordGrid } from '../domain/wordPaths'
import { createWordGame } from '../domain/wordGame'
import { createTrioGame, parseTrioBoard, isTrioValue } from '../domain/trio'
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
  storeMarksProgress(puzzle.id, { ...createGame(board), marks: new Set([0]) }, { elapsedMs: 1200 })
  return { element: <PuzzleStage puzzle={puzzle} board={board} timeZone="UTC" />, read: () => readMarksProgress(puzzle.id, board)?.elapsedMs, snapshot: () => readMarksProgress(puzzle.id, board) }
}
function tracks() {
  const grid = new TrackGrid(3, 1, [3], [1, 1, 1], [1, 0, 1])
  const puzzle: Puzzle = { id: '2026-10-19-tracks', puzzleType: 'train-tracks', seed: 1, generatorVersion: 1, board: grid, difficulty: null }
  storeTrackProgress(puzzle.id, { ...createTracksGame(grid), pieces: [1, MAYBE, 1] }, { elapsedMs: 1200 })
  return { element: <TracksStage puzzle={puzzle} grid={grid} timeZone="UTC" />, read: () => readTrackProgress(puzzle.id, grid)?.elapsedMs, snapshot: () => readTrackProgress(puzzle.id, grid) }
}
const cases = [
  { name: 'Nurikabe preview', setup: () => {
    const board = parseNurikabeBoards(nurikabeRaw)[0]!
    storeNurikabeProgress(board, createNurikabeGame(board).map((v, i) => i === board.clues.indexOf(0) ? 1 : v), { elapsedMs: 1200 })
    return { element: <NurikabeStage board={board} />, read: () => readNurikabeProgress(board)?.elapsedMs, snapshot: () => readNurikabeProgress(board) }
  } },
  { name: 'Queens', setup: () => marks(queen) },
  { name: 'Star Battle', setup: () => marks(star) },
  { name: 'Train Tracks', setup: tracks },
  { name: 'Word Paths', setup: () => {
    const grid = new WordGrid(4, 2, ['C', 'A', 'T', null, 'L', 'I', 'O', 'N'], [3, 4], 2)
    const puzzle: Puzzle = { id: '2026-10-19-words', puzzleType: 'word-paths', seed: 1, generatorVersion: 2, board: grid, difficulty: null }
    storeWordProgress(puzzle.id, { ...createWordGame(grid), trace: [0] }, { elapsedMs: 1200 })
    return { element: <WordPathsStage puzzle={puzzle} grid={grid} timeZone="UTC" />, read: () => readWordProgress(puzzle.id, grid)?.elapsedMs, snapshot: () => readWordProgress(puzzle.id, grid) }
  } },
  { name: 'Trio preview', setup: () => {
    const board = parseTrioBoard(trioRaw[0]); storeTrioProgress(board, { ...createTrioGame(board), cells: board.givens.map((v, i) => i === board.givens.indexOf(0) ? 1 : v) }, { elapsedMs: 1200 })
    return { element: <TrioStage board={board} />, read: () => readTrioProgress(board)?.elapsedMs, snapshot: () => readTrioProgress(board) }
  } },
  { name: 'Tents preview', setup: () => {
    const board = parseTentsBoard(tentsRaw[0]); storeTentsProgress(board, createTentsGame(board).map((v, i) => i === Array.from({ length: board.size ** 2 }, (_, c) => c).find(c => !board.trees.includes(c)) ? 1 : v), { elapsedMs: 1200 }, 0)
    return { element: <TentsStage board={board} />, read: () => readTentsProgress(board)?.elapsedMs, snapshot: () => readTentsProgress(board) }
  } },
  { name: 'Sudoku preview', setup: () => {
    const board = parseSudokuBoards(sudokuRaw)[0]!; storeSudokuProgress(board, { ...createSudokuGame(board), cells: board.givens.map((v, i) => i === board.givens.indexOf(0) ? 1 : v) }, { elapsedMs: 1200 }, 0)
    return { element: <SudokuStage board={board} />, read: () => readSudokuProgress(board)?.elapsedMs, snapshot: () => readSudokuProgress(board) }
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
    storeMarksProgress(puzzle.id, { board, queens: new Set([3, 5, 12, 19]), marks: new Set() }, { elapsedMs: 1200 })
  }
  await mount(playing.element)
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  await click('Reset'); await click('Undo')
  await tick(1000)
  await focus(false); await tick(10_000); await focus(true); await tick(650); now += 125
  await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Get an explained hint"]')!.click())
  await act(async () => container.querySelector<HTMLButtonElement>('.apply-hint')!.click())
  expect(readStoredStats()[0]).toMatchObject({ elapsedMs: 2975, attemptElapsedMs: 1775 })
  expect(publication.offerSolve).toHaveBeenCalledExactlyOnceWith(readStoredStats()[0])
  expect(playing.read()).toBeUndefined()
  await tick(10_000)
  expect(container.querySelector('[role="timer"]')?.textContent).toBe('Total 0:02')
  expect(container.querySelector('[aria-label="Since reset"]')?.textContent).toBe('0:01')
  expect(readStoredStats()[0]).toMatchObject({ elapsedMs: 2975, attemptElapsedMs: 1775 })
})

const button = (text: string) => [...container.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === text)!
const click = async (text: string) => { await act(async () => button(text).click()) }

it.each(cases)('$name keeps total through cancelled, repeated and undone resets and reload', async ({ setup }) => {
  const { element, snapshot } = setup()
  await mount(element)
  const original = snapshot()!
  expect(original.attemptElapsedMs).toBeUndefined()
  await tick(1000)
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  await click('Reset')
  expect(snapshot()).toEqual({ ...original, elapsedMs: 2200 })
  now += 125.75
  confirm.mockReturnValue(true)
  await click('Reset')
  expect(snapshot()).toMatchObject({ elapsedMs: 2325, attemptElapsedMs: 0 })
  expect(container.querySelector('[aria-label="Since reset"]')?.textContent).toBe('0:00')
  await click('Undo')
  expect(snapshot()).toEqual({ ...original, elapsedMs: 2325, attemptElapsedMs: 0 })
  await tick(1000)
  expect(snapshot()).toMatchObject({ elapsedMs: 3325, attemptElapsedMs: 1000 })
  now += 100
  await click('Reset')
  expect(snapshot()).toMatchObject({ elapsedMs: 3425, attemptElapsedMs: 0 })
  now += 150
  await focus(false)
  await tick(5000)
  expect(snapshot()).toMatchObject({ elapsedMs: 3575, attemptElapsedMs: 150 })
  await act(async () => root.unmount())
  now += 20_000
  root = createRoot(container)
  await mount(element)
  await tick(1000)
  expect(snapshot()).toMatchObject({ elapsedMs: 3575, attemptElapsedMs: 150 })
  await focus(true)
  await tick(2000)
  expect(snapshot()).toMatchObject({ elapsedMs: 5575, attemptElapsedMs: 2150 })
  expect(container.querySelector('[aria-label="Since reset"]')?.textContent).toBe('0:02')
})

it.each(cases)('$name retains legacy progress and drops only malformed optional timing', ({ setup }) => {
  const { snapshot } = setup()
  const original = snapshot()!
  const key = localStorage.key(0)!
  const raw = JSON.parse(localStorage.getItem(key)!)
  for (const attemptElapsedMs of [undefined, null, -1, .5, 1201, Number.MAX_SAFE_INTEGER + 1, '10']) {
    localStorage.setItem(key, JSON.stringify({ ...raw, attemptElapsedMs }))
    expect(snapshot()).toEqual(original)
  }
  for (const attemptElapsedMs of [0, 500, 1200]) {
    localStorage.setItem(key, JSON.stringify({ ...raw, attemptElapsedMs }))
    expect(snapshot()).toEqual({ ...original, attemptElapsedMs })
  }
})

const key = async (index: number, value: string) => {
  const cell = container.querySelector<HTMLButtonElement>(`[data-cell="${index}"]`)!
  await act(async () => cell.focus())
  await act(async () => cell.dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true })))
}
const completionCases = [
  { name: 'Star Battle', setup: () => {
    const board = new Board(4, Array.from({ length: 16 }, (_, i) => Math.floor(i / 4)), [1, 1, 1, 1], 'star-battle')
    const puzzle: Puzzle = { id: '2026-10-19-star', puzzleType: 'star-battle', seed: 1, generatorVersion: 1, board, difficulty: null }
    storeMarksProgress(puzzle.id, { board, queens: new Set([1, 7, 8]), marks: new Set() }, { elapsedMs: 1200 }, 2)
    return { element: <PuzzleStage puzzle={puzzle} board={board} timeZone="UTC" />, finish: () => key(14, 'Enter'), read: () => readMarksProgress(puzzle.id, board), daily: true }
  } },
  { name: 'Word Paths', setup: () => {
    const grid = new WordGrid(4, 2, ['C', 'A', 'T', null, 'L', 'I', 'O', 'N'], [3, 4], 2)
    const puzzle: Puzzle = { id: '2026-10-19-words', puzzleType: 'word-paths', seed: 1, generatorVersion: 2, board: grid, difficulty: null }
    storeWordProgress(puzzle.id, { ...createWordGame(grid), words: [[0, 1, 2]], trace: [4, 5, 6, 7] }, { elapsedMs: 1200 }, false, 2)
    return { element: <WordPathsStage puzzle={puzzle} grid={grid} timeZone="UTC" />, finish: () => key(7, 'Enter'), read: () => readWordProgress(puzzle.id, grid), daily: true }
  } },
  { name: 'Trio', setup: () => {
    const board = parseTrioBoard(trioRaw[0]), solution = trioProof.samples[0]!.solution
    if (!solution.every(isTrioValue)) throw Error('Invalid Trio fixture')
    const last = board.givens.indexOf(0)
    storeTrioProgress(board, { cells: solution.map((v, i) => i === last ? 0 : v), notes: Array<number>(81).fill(0) }, { elapsedMs: 1200 })
    return { element: <TrioStage board={board} />, finish: () => key(last, String(solution[last])), read: () => readTrioProgress(board), daily: false }
  } },
  { name: 'Tents', setup: () => {
    const board = parseTentsBoard(tentsRaw[0]), solution = tentsProof.samples[0]!.solution, last = solution.at(-1)!
    storeTentsProgress(board, createTentsGame(board).map((_, i) => i !== last && solution.includes(i) ? 1 : 0), { elapsedMs: 1200 }, 2)
    return { element: <TentsStage board={board} />, finish: () => key(last, '1'), read: () => readTentsProgress(board), daily: false }
  } },
  { name: 'Sudoku', setup: () => {
    const board = parseSudokuBoards(sudokuRaw)[0]!, solution = sudokuProof.samples[0]!.solution, last = board.givens.indexOf(0)
    storeSudokuProgress(board, { cells: solution.map((v, i) => i === last ? 0 : v), notes: Array<number>(81).fill(0) }, { elapsedMs: 1200 }, 2)
    return { element: <SudokuStage board={board} />, finish: () => key(last, String(solution[last])), read: () => readSudokuProgress(board), daily: false }
  } },
  { name: 'Nurikabe', setup: () => {
    const board = parseNurikabeBoards(nurikabeRaw)[0]!, solution = nurikabeProof.samples[0]!.solution
    const last = solution.lastIndexOf(0)
    storeNurikabeProgress(board, solution.map((v, i) => i === last ? 0 : v === 0 ? 1 : board.clues[i] ? 2 : 0), { elapsedMs: 1200 })
    return { element: <NurikabeStage board={board} />, finish: () => key(last, 's'), read: () => readNurikabeProgress(board), daily: false }
  } },
]
it.each(completionCases)('$name freezes both reset times at the exact completion instant', async ({ setup }) => {
  const { element, finish, read, daily } = setup()
  await mount(element)
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  await click('Reset'); await click('Undo')
  await tick(650); now += 125
  await finish()
  expect(read()).toBeNull()
  expect(button('Reset').disabled).toBe(true)
  expect(button('Undo').disabled).toBe(true)
  expect(container.querySelector('[aria-label="Elapsed active time"]')?.textContent).toBe('Total 0:01')
  expect(container.querySelector('[aria-label="Since reset"]')?.textContent).toBe('0:00')
  if (daily) {
    expect(readStoredStats()[0]).toMatchObject({ elapsedMs: 1975, attemptElapsedMs: 775, hints: 2 })
    expect(publication.offerSolve).toHaveBeenCalledExactlyOnceWith(readStoredStats()[0])
  } else {
    expect(readStoredStats()).toEqual([])
    expect(publication.offerSolve).not.toHaveBeenCalled()
  }
  await tick(10_000)
  expect(container.querySelector('[aria-label="Elapsed active time"]')?.textContent).toBe('Total 0:01')
  expect(container.querySelector('[aria-label="Since reset"]')?.textContent).toBe('0:00')
})
