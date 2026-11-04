// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import proof from '@shared/docs/measurements/tents-preview.json'
import raw from '../data/tents-previews.json'
import { createTentsGame, tentsConflicts, TentsGrid, type TentsBoard, type TentsGame, type TentsMark } from '../domain/tents'
import { readTentsProgress, storeTentsProgress } from '../lib/tentsProgress'
import { TentsStage } from './TentsStage'

vi.mock('../lib/useLeaderboard', () => ({ useLeaderboard: () => ({ offerSolve: vi.fn() }) }))
const fixture = raw[6]!, answer = new Set(proof.samples[6]!.solution)
const board = new TentsGrid('2026-11-04-tents', fixture.size, fixture.trees, fixture.rowClues, fixture.colClues)
let container: HTMLDivElement, root: Root
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  HTMLElement.prototype.scrollIntoView = vi.fn()
  localStorage.clear(); container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); localStorage.clear(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
const button = (name: string) => [...container.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.trim() === name || item.getAttribute('aria-label') === name)!
async function click(name: string) { expect(button(name), name).toBeDefined(); await act(async () => button(name).click()) }
async function mount(game: TentsGame) {
  storeTentsProgress(board, game, { elapsedMs: 0 }, 0, true)
  const puzzle = { id: board.id, puzzleType: 'tents' as const, seed: 1, generatorVersion: 1, board, difficulty: null }
  await act(async () => root.render(<MemoryRouter><TentsStage board={board} puzzle={puzzle} /></MemoryRouter>))
}

it('checks correct tents and grass without revealing a cell or using a hint', async () => {
  const tent = [...answer][0]!, grass = createTentsGame(board).findIndex((_, i) => !answer.has(i) && !board.trees.includes(i))
  const game = createTentsGame(board).map((_, i): TentsMark => i === tent ? 1 : i === grass ? 2 : 0)
  await mount(game); await click('Check progress')
  expect(container.textContent).toContain('Your tents and grass are correct so far')
  expect(container.querySelector('[data-hint="target"]')).toBeNull()
  expect(readTentsProgress(board, true)).toMatchObject({ game, hints: 0 })
})

it('reports a wrong mark without revealing it until requested, then allows undo', async () => {
  vi.useFakeTimers()
  const game = createTentsGame(board)
  const wrong = [...answer].find(cell => tentsConflicts(board, game.map((_, i): TentsMark => i === cell ? 2 : 0)).size === 0)!
  const marked = game.map((_, i): TentsMark => i === wrong ? 2 : 0)
  await mount(marked); await click('Check progress')
  expect(container.textContent).toContain('At least one tent or grass mark is incorrect')
  expect(container.querySelector('[data-hint="target"]')).toBeNull()
  expect(readTentsProgress(board, true)?.hints).toBe(0)
  await click('Show the mistake')
  expect(container.querySelector<HTMLElement>(`[data-cell="${wrong}"]`)?.dataset['hint']).toBe('target')
  expect(readTentsProgress(board, true)?.hints).toBe(1)
  button('Apply move').focus(); await act(async () => vi.advanceTimersByTime(1000))
  expect(document.activeElement).toBe(button('Apply move'))
  await click('Apply move'); expect(readTentsProgress(board, true)?.game[wrong]).toBe(0)
  await click('Undo'); expect(readTentsProgress(board, true)?.game[wrong]).toBe(2)
  expect(readTentsProgress(board, true)?.hints).toBe(1)
})

it('asks for a mark before checking an empty board', async () => {
  await mount(createTentsGame(board)); await click('Check progress')
  expect(container.textContent).toContain('Place a tent or mark grass before checking')
  expect(readTentsProgress(board, true)?.hints).toBe(0)
})

it('does not claim correctness for a puzzle with multiple solutions', async () => {
  const ambiguous: TentsBoard = { id: 'tents-preview-99', size: 8, trees: [1, 17],
    rowClues: [1, 0, 1, 0, 0, 0, 0, 0], colClues: [1, 0, 1, 0, 0, 0, 0, 0] }
  const game = createTentsGame(ambiguous).map((_, i): TentsMark => i === 0 ? 1 : 0)
  storeTentsProgress(ambiguous, game, { elapsedMs: 0 }, 0)
  await act(async () => root.render(<MemoryRouter><TentsStage board={ambiguous} /></MemoryRouter>))
  await click('Check progress')
  expect(container.textContent).toContain('could not verify a unique solution')
  expect(container.querySelector('[data-hint="target"]')).toBeNull()
})
