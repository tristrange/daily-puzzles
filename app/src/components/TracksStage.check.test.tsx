// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Puzzle } from '../domain/puzzle'
import { TrackGrid } from '../domain/tracks'
import { createTracksGame, CROSS, MAYBE, type TracksGame } from '../domain/tracksGame'
import { readTrackProgress, storeTrackProgress } from '../lib/trackProgress'
import { TracksStage } from './TracksStage'

vi.mock('../lib/useLeaderboard', () => ({ useLeaderboard: () => ({ offerSolve: vi.fn() }) }))
const grid = new TrackGrid(3, 3, [0, 3, 0], [1, 1, 1], [0, 0, 0, 1, 0, 1, 0, 0, 0])
const puzzle: Puzzle = { id: '2026-10-19-tracks', puzzleType: 'train-tracks', seed: 1, generatorVersion: 1, board: grid, difficulty: null }
let container: HTMLDivElement, root: Root
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  HTMLElement.prototype.scrollIntoView = vi.fn()
  localStorage.clear(); container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); localStorage.clear(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
const button = (name: string) => [...container.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.trim() === name || item.getAttribute('aria-label') === name)!
async function click(name: string) { expect(button(name), name).toBeDefined(); await act(async () => button(name).click()) }
async function mount(game: TracksGame) {
  storeTrackProgress(puzzle.id, game, { elapsedMs: 0 }, 0)
  await act(async () => root.render(<MemoryRouter><TracksStage puzzle={puzzle} grid={grid} timeZone="UTC" /></MemoryRouter>))
}
const withMark = (cell: number, value: number): TracksGame => ({ grid, pieces: grid.givens.map((piece, i) => i === cell ? value : piece) })

it('checks an undecided track and a cross without using a hint', async () => {
  const game = withMark(4, MAYBE)
  game.pieces = game.pieces.map((piece, cell) => cell === 0 ? CROSS : piece)
  await mount(game); await click('Check progress')
  expect(container.textContent).toContain('Your tracks and marks are correct so far')
  expect(container.querySelector('[data-hint="target"]')).toBeNull()
  expect(readTrackProgress(puzzle.id, grid)).toMatchObject({ game, hints: 0 })
})

it('reports a wrong mark without revealing it until requested, then allows undo', async () => {
  vi.useFakeTimers()
  await mount(withMark(4, CROSS)); await click('Check progress')
  expect(container.textContent).toContain('At least one track or mark is incorrect')
  expect(container.querySelector('[data-hint="target"]')).toBeNull()
  expect(readTrackProgress(puzzle.id, grid)?.hints).toBe(0)
  await click('Show the mistake')
  expect(container.querySelector<HTMLElement>('[data-cell="4"]')?.dataset['hint']).toBe('target')
  expect(readTrackProgress(puzzle.id, grid)?.hints).toBe(1)
  button('Apply move').focus(); await act(async () => vi.advanceTimersByTime(1000))
  expect(document.activeElement).toBe(button('Apply move'))
  await click('Apply move'); expect(readTrackProgress(puzzle.id, grid)?.game.pieces[4]).toBe(0)
  await click('Undo last move'); expect(readTrackProgress(puzzle.id, grid)?.game.pieces[4]).toBe(CROSS)
  expect(readTrackProgress(puzzle.id, grid)?.hints).toBe(1)
})

it('asks for a mark before checking an empty board', async () => {
  await mount(createTracksGame(grid)); await click('Check progress')
  expect(container.textContent).toContain('Add a track or mark before checking')
  expect(readTrackProgress(puzzle.id, grid)?.hints).toBe(0)
})

it('does not claim correctness if the puzzle has multiple solutions', async () => {
  const board = new TrackGrid(4, 4, [3, 3, 4, 2], [1, 3, 4, 4], [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 4, 0])
  const other: Puzzle = { ...puzzle, board }
  const game = { grid: board, pieces: board.givens.map((piece, i) => i === 0 ? MAYBE : piece) }
  storeTrackProgress(other.id, game, { elapsedMs: 0 }, 0)
  await act(async () => root.render(<MemoryRouter><TracksStage puzzle={other} grid={board} timeZone="UTC" /></MemoryRouter>))
  await click('Check progress')
  expect(container.textContent).toContain('could not verify a unique solution')
  expect(container.querySelector('[data-hint="target"]')).toBeNull()
})
