// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import raw from '../data/tents-previews.json'
import proof from '@shared/docs/measurements/tents-preview.json'
import { createTentsGame, parseTentsBoard } from '../domain/tents'
import { readTentsProgress, storeTentsProgress } from '../lib/tentsProgress'
import { STATS_STORAGE_KEY } from '../lib/stats'
import { TentsStage } from './TentsStage'

const board = parseTentsBoard(raw[0])
let container: HTMLDivElement, root: Root
beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
  localStorage.clear()
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

it('plays with keyboard, preserves trees, persists Undo/Redo and confirms Reset', async () => {
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

it('completes without adding daily stats and starts fresh when reopened', async () => {
  const solution = proof.samples[0]!.solution, last = solution[0]!
  const game = createTentsGame(board).map((_, cell) => cell !== last && solution.includes(cell) ? 1 as const : 0 as const)
  localStorage.setItem(STATS_STORAGE_KEY, '[]')
  storeTentsProgress(board, game, 5000, 2)
  await act(async () => root.render(<TentsStage board={board} />))
  await key(last, '1')
  expect(container.querySelector('[role="status"]')?.textContent).toContain('Solved')
  expect(button('Hint').disabled).toBe(true)
  expect(button('Undo').disabled).toBe(true)
  expect(readTentsProgress(board)).toBeNull()
  expect(localStorage.getItem(STATS_STORAGE_KEY)).toBe('[]')
})
