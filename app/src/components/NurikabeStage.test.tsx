// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import raw from '../data/nurikabe-previews.json'
import proof from '@shared/docs/measurements/nurikabe-preview.json'
import { createNurikabeGame, parseNurikabeBoards, type NurikabeGame } from '../domain/nurikabe'
import { readNurikabeProgress, storeNurikabeProgress } from '../lib/nurikabeProgress'
import { NurikabeStage } from './NurikabeStage'

const board = parseNurikabeBoards(raw)[0]!
let container: HTMLDivElement, root: Root
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  localStorage.clear()
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks() })
const cell = (index: number) => container.querySelector<HTMLButtonElement>(`[data-cell="${index}"]`)!
const button = (text: string) => [...container.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === text)!
const click = async (text: string) => { await act(async () => button(text).click()) }
const key = async (index: number, value: string, ctrlKey = false) => {
  await act(async () => cell(index).focus())
  await act(async () => cell(index).dispatchEvent(new KeyboardEvent('keydown', { key: value, ctrlKey, bubbles: true })))
}

it('supports keyboard and virtual clicks, immutable clues, saved Undo/Redo and confirmed Reset', async () => {
  await act(async () => root.render(<NurikabeStage board={board} />))
  expect(button('Reset').disabled).toBe(true)
  await key(0, 's')
  expect(button('Undo').disabled).toBe(true)
  await key(1, 'l')
  expect(readNurikabeProgress(board)?.game[1]).toBe(2)
  await key(1, 'z', true)
  expect(readNurikabeProgress(board)?.game[1]).toBe(0)
  await click('Redo')
  expect(readNurikabeProgress(board)?.game[1]).toBe(2)
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  await click('Reset'); expect(readNurikabeProgress(board)?.game[1]).toBe(2)
  confirm.mockReturnValue(true)
  await click('Reset'); expect(button('Reset').disabled).toBe(true)
  await click('Undo'); expect(readNurikabeProgress(board)?.game[1]).toBe(2)
  await act(async () => cell(2).click())
  expect(readNurikabeProgress(board)?.game[2]).toBe(1)
  await key(2, 'End')
  expect(document.activeElement).toBe(cell(4))
  await act(async () => root.unmount()); root = createRoot(container)
  await act(async () => root.render(<NurikabeStage board={board} />))
  expect(cell(1).getAttribute('aria-label')).toContain('Land')
  expect(button('Undo').disabled).toBe(true)
})

it('commits a painted stroke as one history entry and rolls back interrupted or multitouch gestures', async () => {
  await act(async () => root.render(<NurikabeStage board={board} />))
  const grid = container.querySelector<HTMLElement>('[role="grid"]')!
  Object.assign(grid, { setPointerCapture: () => {}, hasPointerCapture: () => false })
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: (x: number) => cell(x) })
  const pointer = async (type: string, index: number, id = 1) => {
    const event = new MouseEvent(type, { bubbles: true, clientX: index, button: 0 })
    Object.defineProperty(event, 'pointerId', { value: id })
    await act(async () => grid.dispatchEvent(event))
  }
  await pointer('pointerdown', 1); await pointer('pointermove', 2); await pointer('pointermove', 3)
  expect(cell(3).getAttribute('aria-label')).toContain('fixed land')
  await pointer('pointercancel', 2)
  expect(readNurikabeProgress(board)?.game).toEqual(createNurikabeGame(board))
  expect(button('Undo').disabled).toBe(true)
  await pointer('pointerdown', 1); await pointer('pointermove', 2); await pointer('pointerdown', 5, 2)
  expect(readNurikabeProgress(board)?.game).toEqual(createNurikabeGame(board))
  await pointer('pointerdown', 1); await pointer('pointermove', 2); await pointer('pointermove', 1); await pointer('pointerup', 2)
  expect(readNurikabeProgress(board)?.game.slice(1, 3)).toEqual([1, 1])
  await click('Undo')
  expect(readNurikabeProgress(board)?.game).toEqual(createNurikabeGame(board))
  expect(button('Undo').disabled).toBe(true)
  await click('Redo')
  await pointer('pointerdown', 5); await pointer('pointermove', 7)
  await key(7, 'z', true)
  expect(readNurikabeProgress(board)?.game).toEqual(createNurikabeGame(board))
})

it('completes from sea shading, locks the result and clears only its preview save', async () => {
  const solution: NurikabeGame = proof.samples[0]!.solution.map((mark, cell) => mark === 0 ? 1 : board.clues[cell] ? 2 : 0)
  const last = solution.lastIndexOf(1), unfinished = solution.map((mark, cell) => cell === last ? 0 : mark)
  storeNurikabeProgress(board, unfinished, 5000)
  localStorage.setItem('daily-puzzles.stats', 'keep')
  await act(async () => root.render(<NurikabeStage board={board} />))
  await key(last, 's')
  expect(container.querySelector('[role="status"]')?.textContent).toContain('Solved in 0:05')
  expect(button('Undo').disabled).toBe(true)
  expect(button('Reset').disabled).toBe(true)
  expect(readNurikabeProgress(board)).toBeNull()
  expect(localStorage.getItem(`daily-puzzles.nurikabe-preview.v1.${board.id}`)).toBeNull()
  expect(localStorage.getItem('daily-puzzles.stats')).toBe('keep')
  expect(container.querySelector('[role="gridcell"]')?.getAttribute('aria-readonly')).toBe('true')
})

it('warns when saving is blocked but keeps editing usable', async () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('blocked') })
  await act(async () => root.render(<NurikabeStage board={board} />))
  await key(1, 's')
  expect(container.textContent).toContain('Progress can’t be saved')
  expect(cell(1).dataset['mark']).toBe('1')
  await click('Undo')
  expect(cell(1).dataset['mark']).toBe('0')
})
