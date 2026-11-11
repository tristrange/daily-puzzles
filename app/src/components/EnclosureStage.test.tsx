// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { EnclosureGrid } from '../domain/enclosure'
import type { Puzzle } from '../domain/puzzle'
import { readStoredStats, STATS_STORAGE_KEY } from '../lib/stats'
import { EnclosureStage } from './EnclosureStage'

const grid = new EnclosureGrid(4, [0, 1, 2, 3, 4, 7, 8, 11, 12, 13, 14, 15], 5, 2, 4)
const puzzle: Puzzle = { id: '2000-01-02-enclosure', puzzleType: 'enclosure', board: grid, seed: 0, generatorVersion: 1, difficulty: null }
let container: HTMLDivElement, root: Root
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); localStorage.clear(); container = document.createElement('div'); document.body.append(container); root = createRoot(container) })
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks() })
const cell = (i: number) => container.querySelector<HTMLButtonElement>(`[data-cell="${i}"]`)!
const button = (name: string) => [...container.querySelectorAll('button')].find(b => b.textContent === name)!
const click = async (element: HTMLButtonElement) => { await act(async () => element.click()) }
const render = async (daily = true) => { await act(async () => root.render(<EnclosureStage grid={grid} {...(daily ? { puzzle } : {})} />)) }

it('requires enclosure, respects the wall budget and keeps the board editable', async () => {
  const escaping = new EnclosureGrid(3, [], 4, 1)
  await act(async () => root.render(<EnclosureStage grid={escaping} />))
  expect(button('Submit enclosure').disabled).toBe(true)
  await click(cell(1)); await click(cell(3))
  expect(container.textContent).toContain('No walls remaining')
  expect(cell(3).dataset['wall']).toBe('false')
})

it('submits manually, improves without replacing the first completion, and restores the current board', async () => {
  await render()
  await click(cell(6)); await click(cell(9))
  expect(readStoredStats()).toHaveLength(0)
  await click(button('Submit enclosure'))
  const first = readStoredStats()[0]!
  expect(first.enclosureBest?.score).toBe(1)
  expect(button('Save improved score').disabled).toBe(true)
  await click(cell(6)); await click(button('Save improved score'))
  const improved = readStoredStats()[0]!
  expect(improved.enclosureBest?.score).toBe(3)
  expect(improved.solvedAt).toBe(first.solvedAt)
  expect(improved.elapsedMs).toBe(first.elapsedMs)
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  await click(button('Reset')); expect(cell(9).dataset['wall']).toBe('false')
  await click(button('Undo')); expect(cell(9).dataset['wall']).toBe('true')
  await act(async () => root.unmount()); root = createRoot(container); await render()
  expect(cell(9).dataset['wall']).toBe('true')
  expect(container.textContent).toContain('Best score: 3')
})

it('does not write daily stats for preview', async () => {
  await render(false); await click(button('Submit enclosure'))
  expect(localStorage.getItem(STATS_STORAGE_KEY)).toBeNull()
  expect(container.textContent).toContain('Best score: 4')
})

it('freezes the completion clock through improvements and reload', async () => {
  let now = 1000
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  await render()
  await click(cell(6)); await click(cell(9))
  now = 6000
  await click(button('Submit enclosure'))
  expect(readStoredStats()[0]?.elapsedMs).toBe(5000)
  now = 16000
  await click(cell(6)); await click(button('Save improved score'))
  expect(readStoredStats()[0]?.elapsedMs).toBe(5000)
  await act(async () => root.unmount())
  root = createRoot(container)
  await render()
  now = 26000
  await click(cell(9)); await click(button('Save improved score'))
  expect(readStoredStats()[0]?.elapsedMs).toBe(5000)
  expect(readStoredStats()[0]?.enclosureBest?.score).toBe(4)
})

it('reports storage failures', async () => {
  await render()
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('unavailable') })
  await click(cell(6)); await click(button('Submit enclosure'))
  expect(container.textContent).toContain('Could not save the current board')
  expect(container.textContent).toContain('Could not save your submitted score')
})
