// @vitest-environment jsdom
import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import raw from '../data/tents-previews.json'
import proof from '@shared/docs/measurements/tents-preview.json'
import { createTentsGame, parseTentsBoard } from '../domain/tents'
import { readTentsProgress, storeTentsProgress } from '../lib/tentsProgress'
import { readStoredStats, STATS_STORAGE_KEY } from '../lib/stats'
import { TentsGrid } from '../domain/tents'
import type { Puzzle } from '../domain/puzzle'
import { copyText } from '../lib/share'
import { TentsStage } from './TentsStage'

const publication = vi.hoisted(() => ({ offerSolve: vi.fn() }))
vi.mock('../lib/useLeaderboard', () => ({ useLeaderboard: () => ({ offerSolve: publication.offerSolve, status: 'disabled' }) }))
vi.mock('../lib/share', async (original) => ({ ...await original<typeof import('../lib/share')>(),
  copyText: vi.fn(async () => true), puzzleShareLink: (id: string) => `https://example.test/#/archive/${id}` }))

const board = parseTentsBoard(raw[0])
let container: HTMLDivElement, root: Root
beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
  localStorage.clear(); vi.clearAllMocks()
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks() })
const cell = (index: number) => container.querySelector<HTMLButtonElement>(`[data-cell="${index}"]`)!
const button = (label: string) => [...container.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === label)!
async function click(label: string) { await act(async () => button(label).click()) }
async function key(index: number, value: string) {
  await act(async () => cell(index).focus())
  await act(async () => cell(index).dispatchEvent(new KeyboardEvent('keydown', { key: value, bubbles: true })))
}

it.each([0, 6])('plays preview %s with keyboard, saved Undo/Redo and confirmed Reset', async index => {
  const board = parseTentsBoard(raw[index])
  await act(async () => root.render(<TentsStage board={board} />))
  await key(board.trees[0]!, '1')
  expect(button('Undo').disabled).toBe(true)
  await key(0, '2')
  expect(readTentsProgress(board)?.game[0]).toBe(2)
  await click('Undo'); expect(readTentsProgress(board)?.game[0]).toBe(0)
  await click('Redo'); expect(readTentsProgress(board)?.game[0]).toBe(2)
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  await click('Reset'); expect(readTentsProgress(board)?.game[0]).toBe(2)
  confirm.mockReturnValue(true)
  await click('Reset'); expect(readTentsProgress(board)?.game[0]).toBe(0)
  await click('Undo'); expect(readTentsProgress(board)?.game[0]).toBe(2)
  await act(async () => root.unmount())
  root = createRoot(container)
  await act(async () => root.render(<TentsStage board={board} />))
  expect(cell(0).getAttribute('aria-label')).toContain('Grass')
  expect(button('Undo').disabled).toBe(true)
})

it('explains and highlights a hint, applying it as one saved undoable move', async () => {
  await act(async () => root.render(<TentsStage board={board} />))
  await click('Hint')
  const target = container.querySelector<HTMLButtonElement>('[data-hint="target"]')!
  const index = Number(target.dataset['cell'])
  expect(container.querySelectorAll('[data-hint="support"]').length).toBeGreaterThan(0)
  expect(container.querySelector('.hint-panel')?.textContent).toContain('tree')
  await click('Apply move')
  expect(readTentsProgress(board)?.game[index]).toBe(2)
  expect(readTentsProgress(board)?.hints).toBe(1)
  await click('Undo'); expect(readTentsProgress(board)?.game[index]).toBe(0)
  expect(readTentsProgress(board)?.hints).toBe(1)
  await click('Redo'); expect(readTentsProgress(board)?.game[index]).toBe(2)
})

it('shows a line arrangement before applying one saved, undoable tent', async () => {
  const board = parseTentsBoard({ id: 'tents-preview-1', size: 8, trees: [8, 9, 10],
    rowClues: [2, 0, 1, 0, 0, 0, 0, 0], colClues: [1, 1, 1, 0, 0, 0, 0, 0] })
  const open = [0, 1, 2, 16, 17, 18]
  const game = createTentsGame(board).map((_, cell) => board.trees.includes(cell) || open.includes(cell) ? 0 : 2)
  storeTentsProgress(board, game, 5000, 2)
  await act(async () => root.render(<TentsStage board={board} />))
  await click('Hint')
  expect(container.querySelector('.hint-panel')?.textContent).toContain('Possible tent columns: 1, 3')
  expect(container.querySelectorAll('.hint-panel ol li')).toHaveLength(3)
  expect(cell(0).dataset['hint']).toBe('target')
  expect(cell(2).dataset['hint']).toBe('support')
  expect(cell(0).getAttribute('aria-label')).toContain('Empty')
  expect(readTentsProgress(board)?.hints).toBe(3)
  await click('Apply move'); expect(readTentsProgress(board)?.game[0]).toBe(1)
  await click('Undo'); expect(readTentsProgress(board)?.game[0]).toBe(0)
  await click('Redo'); expect(readTentsProgress(board)?.game[0]).toBe(1)
  expect(readTentsProgress(board)?.hints).toBe(3)
})

it('treats a drag as one move and restores cancelled strokes', async () => {
  await act(async () => root.render(<TentsStage board={board} />))
  await act(async () => container.querySelector<HTMLInputElement>('input[aria-label="Grass"]')!.click())
  const grid = container.querySelector<HTMLElement>('[role="grid"]')!
  Object.assign(grid, { setPointerCapture: () => {}, hasPointerCapture: () => false })
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: (x: number) => cell(x) })
  const pointer = async (type: string, index: number) => {
    const event = new MouseEvent(type, { bubbles: true, clientX: index, button: 0 })
    Object.defineProperty(event, 'pointerId', { value: 1 })
    await act(async () => grid.dispatchEvent(event))
  }
  await pointer('pointerdown', 0); await pointer('pointermove', 8)
  expect(cell(8).getAttribute('aria-label')).toContain('Grass')
  await pointer('pointercancel', 8)
  expect(readTentsProgress(board)?.game[0]).toBe(0)
  expect(readTentsProgress(board)?.game[8]).toBe(0)
  expect(button('Undo').disabled).toBe(true)
  await pointer('pointerdown', 0); await pointer('pointermove', 8); await pointer('pointerup', 8)
  expect(readTentsProgress(board)?.game[0]).toBe(2)
  expect(readTentsProgress(board)?.game[8]).toBe(2)
  await click('Undo')
  expect(readTentsProgress(board)?.game[0]).toBe(0)
  expect(readTentsProgress(board)?.game[8]).toBe(0)
  expect(button('Undo').disabled).toBe(true)
})

it.each([0, 6])('completes preview %s without adding daily stats', async index => {
  const board = parseTentsBoard(raw[index])
  const solution = proof.samples[index]!.solution, last = solution.at(-1)!
  const game = createTentsGame(board).map((_, cell) => cell !== last && solution.includes(cell) ? 1 as const : 0 as const)
  localStorage.setItem(STATS_STORAGE_KEY, '[]')
  storeTentsProgress(board, game, 5000, 2)
  await act(async () => root.render(<TentsStage board={board} />))
  expect(container.querySelectorAll('[role="gridcell"]')).toHaveLength(board.size ** 2)
  await key(last, 'End')
  expect(document.activeElement).toBe(cell(board.size ** 2 - 1))
  await key(last, '1')
  expect(container.querySelector('[role="status"]')?.textContent).toContain('Solved')
  expect(button('Hint').disabled).toBe(true)
  expect(button('Undo').disabled).toBe(true)
  expect(readTentsProgress(board)).toBeNull()
  expect(localStorage.getItem(STATS_STORAGE_KEY)).toBe('[]')
})

it('finishes daily Tents, shares the first result, and keeps preview progress and replay stats separate', async () => {
  const preview = parseTentsBoard(raw[6])
  const board = new TentsGrid('2026-10-20-tents', preview.size, preview.trees, preview.rowClues, preview.colClues)
  const puzzle: Puzzle = { id: board.id, puzzleType: 'tents', seed: 123, generatorVersion: 1, board, difficulty: null }
  const solution = proof.samples[6]!.solution, last = solution.at(-1)!
  const game = createTentsGame(board).map((_, cell) => cell !== last && solution.includes(cell) ? 1 as const : 0 as const)
  storeTentsProgress(preview, game, 9000, 1)
  const previewSave = localStorage.getItem(`daily-puzzles.tents-preview.v1.${preview.id}`)
  storeTentsProgress(board, game, 5000, 2, true)
  expect(readTentsProgress(board)).toBeNull()
  await act(async () => root.render(<MemoryRouter><TentsStage board={board} puzzle={puzzle} /></MemoryRouter>))
  expect(cell(solution[0]!).getAttribute('aria-label')).toContain('Tent')
  await key(last, '1')
  expect(container.querySelector('.solved-banner')?.textContent).toContain('Solved — nice!')
  expect(readTentsProgress(board, true)).toBeNull()
  expect(localStorage.getItem(`daily-puzzles.tents-preview.v1.${preview.id}`)).toBe(previewSave)
  const first = readStoredStats()[0]!
  expect(first).toMatchObject({ id: puzzle.id, puzzleType: 'tents', size: 10, hints: 2 })
  expect(publication.offerSolve).toHaveBeenCalledExactlyOnceWith(first)
  await click('Copy result')
  const result = vi.mocked(copyText).mock.lastCall![0]
  expect(result).toContain('Tents 10×10')
  expect(result).toContain('2 hints')
  expect(result).toContain(`/#/archive/${puzzle.id}`)
  expect(result).not.toContain('⛺')
  await click('Copy with solution')
  expect(vi.mocked(copyText).mock.lastCall![0]).toContain('⛺')
  expect(vi.mocked(copyText).mock.lastCall![0]).toContain('🌳')
  await act(async () => root.unmount())
  root = createRoot(container)
  storeTentsProgress(board, game, 9000, 7, true)
  await act(async () => root.render(<MemoryRouter><TentsStage board={board} puzzle={puzzle} /></MemoryRouter>))
  await key(last, '1')
  expect(container.querySelector('.solved-banner')?.textContent).toContain('your first solve')
  expect(readStoredStats()).toEqual([first])
  expect(publication.offerSolve).toHaveBeenCalledTimes(1)
  await click('Copy result')
  expect(vi.mocked(copyText).mock.lastCall![0]).toBe(result)
})
