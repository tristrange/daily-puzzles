// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import raw from '../data/trio-previews.json'
import pilot from '@shared/docs/measurements/trio-pilot.json'
import { isTrioValue, parseTrioBoard, TrioGrid, type TrioBoard } from '../domain/trio'
import { readTrioProgress, storeTrioProgress } from '../lib/trioProgress'
import { readStoredStats, type SolveRecord } from '../lib/stats'
import { LeaderboardContext } from '../lib/useLeaderboard'
import { createLeaderboardStore } from '../lib/leaderboardProgress'
import { TrioStage } from './TrioStage'

const preview = parseTrioBoard(raw[0]!), solution = pilot.samples[0]!.solution.map(value => {
  if (!isTrioValue(value)) throw Error('Invalid Trio solution fixture')
  return value
})
let container: HTMLDivElement, root: Root
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  localStorage.clear()
  HTMLElement.prototype.scrollIntoView = vi.fn()
  HTMLElement.prototype.setPointerCapture = vi.fn()
  HTMLElement.prototype.hasPointerCapture = () => true
  HTMLElement.prototype.releasePointerCapture = vi.fn()
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: (x: number) => cell(Math.round(x / 20)) })
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove(); localStorage.clear(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks()
})
const cell = (index: number) => container.querySelector<HTMLButtonElement>(`[data-cell="${index}"]`)!
const button = (name: string) => [...container.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.trim() === name || item.getAttribute('aria-label') === name)!
async function click(name: string) { expect(button(name), name).toBeDefined(); await act(async () => button(name).click()) }
async function pointer(type: string, index: number, pointerType = 'touch', pointerId = 1, options: MouseEventInit = {}) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: index * 20, ...options })
  Object.defineProperties(event, { pointerId: { value: pointerId }, pointerType: { value: pointerType }, isPrimary: { value: true } })
  await act(async () => cell(index).dispatchEvent(event))
}
async function tap(index: number, pointerType = 'touch') { await pointer('pointerdown', index, pointerType); await pointer('pointerup', index, pointerType) }
async function mount(board: TrioBoard = preview) { await act(async () => root.render(<MemoryRouter><TrioStage board={board} /></MemoryRouter>)) }
function saveNotes(board: TrioBoard = preview) {
  const notes = Array<number>(81).fill(0); notes[0] = 4; notes[1] = 7
  storeTrioProgress(board, { cells: [...board.givens], notes }, { elapsedMs: 0 })
}

it.each(['touch', 'mouse'])('confirms a single note with two %s taps as one undoable move', async pointerType => {
  saveNotes(); await mount(); await tap(0, pointerType); await tap(0, pointerType)
  expect(readTrioProgress(preview)?.game.cells[0]).toBe(3)
  expect(readTrioProgress(preview)?.game.notes[1]).toBe(3)
  await click('Undo')
  expect(readTrioProgress(preview)?.game.cells[0]).toBe(0)
  expect(readTrioProgress(preview)?.game.notes.slice(0, 2)).toEqual([4, 7])
  await click('Redo')
  expect(readTrioProgress(preview)?.game.cells[0]).toBe(3)
  expect(readTrioProgress(preview)?.game.notes[1]).toBe(3)
})

it('confirms a single note while Notes is on, even with another symbol selected', async () => {
  saveNotes(); await mount(); await click('Notes'); await tap(0); await tap(0)
  expect(readTrioProgress(preview)?.game.cells[0]).toBe(3)
  expect(button('Notes').getAttribute('aria-pressed')).toBe('true')
  await click('Undo'); expect(readTrioProgress(preview)?.game.notes[0]).toBe(4)
})

it('confirms a single note even when the eraser is selected', async () => {
  saveNotes(); await mount()
  await act(async () => container.querySelector<HTMLInputElement>('input[aria-label="Eraser"]')!.click())
  await tap(0); await tap(0)
  expect(readTrioProgress(preview)?.game.cells[0]).toBe(3)
  await click('Undo'); expect(readTrioProgress(preview)?.game.notes[0]).toBe(4)
})

it('keeps ordinary dragging and a cancelled second tap separate from the shortcut', async () => {
  saveNotes(); await mount()
  await pointer('pointerdown', 0); await pointer('pointermove', 1); await pointer('pointerup', 1)
  expect(readTrioProgress(preview)?.game.cells.slice(0, 2)).toEqual([1, 1])
  await click('Undo'); await tap(0)
  await pointer('pointerdown', 0); await pointer('pointercancel', 0)
  expect(readTrioProgress(preview)?.game.cells[0]).toBe(1)
  await click('Undo'); expect(readTrioProgress(preview)?.game.notes[0]).toBe(4)
})

it('keeps slow taps and cells with multiple notes as ordinary edits', async () => {
  saveNotes(); await mount(); await tap(0)
  await act(async () => vi.advanceTimersByTime(501)); await tap(0)
  expect(readTrioProgress(preview)?.game.cells[0]).toBe(0)
  await click('Undo'); expect(readTrioProgress(preview)?.game.cells[0]).toBe(1)
  await click('Undo'); await tap(1); await tap(1)
  expect(readTrioProgress(preview)?.game.cells[1]).toBe(0)
})

it('does not interpret a change of picker as the second tap', async () => {
  saveNotes(); await mount(); await tap(0)
  await act(async () => container.querySelector<HTMLInputElement>('input[aria-label="Moon"]')!.click())
  await tap(0)
  expect(readTrioProgress(preview)?.game.cells[0]).toBe(2)
  await click('Undo'); expect(readTrioProgress(preview)?.game.cells[0]).toBe(1)
})

it('keeps taps on different cells or with different pointer types separate', async () => {
  saveNotes(); await mount(); await tap(0, 'touch'); await tap(1, 'touch'); await tap(0, 'touch')
  expect(readTrioProgress(preview)?.game.cells[0]).toBe(0)
  await click('Undo'); await click('Undo'); await click('Undo')
  await tap(0, 'touch'); await tap(0, 'mouse')
  expect(readTrioProgress(preview)?.game.cells[0]).toBe(0)
})

function nearlySolved(board: TrioBoard, note: number, daily = false) {
  const cells = [...solution]; cells[0] = 0
  const notes = Array<number>(81).fill(0); notes[0] = 1 << (note - 1)
  storeTrioProgress(board, { cells, notes }, { elapsedMs: 5000 }, daily, 0)
}
async function mountDaily(board: TrioGrid, offerSolve: (record: SolveRecord) => Promise<void>) {
  const puzzle = { id: board.id, puzzleType: 'trio' as const, seed: 123, generatorVersion: 1, board, difficulty: null }
  const leaderboard = { ...createLeaderboardStore(null, null, null), offerSolve }
  await act(async () => root.render(<MemoryRouter><LeaderboardContext.Provider value={leaderboard}><TrioStage board={board} puzzle={puzzle} /></LeaderboardContext.Provider></MemoryRouter>))
}
async function selectStar() { await act(async () => container.querySelector<HTMLInputElement>('input[aria-label="Star"]')!.click()) }

it('does not record a provisional solve if the second tap confirms a different note', async () => {
  const board = new TrioGrid('2026-10-31-trio', raw[0]!.givens, raw[0]!.relations), offerSolve = vi.fn(async () => {})
  nearlySolved(board, 1, true); await mountDaily(board, offerSolve); await selectStar()
  await tap(0)
  expect(readStoredStats()).toEqual([])
  expect(readTrioProgress(board, true)?.game.cells[0]).toBe(0)
  await tap(0)
  expect(readTrioProgress(board, true)?.game.cells[0]).toBe(1)
  expect(readStoredStats()).toEqual([]); expect(offerSolve).not.toHaveBeenCalled()
  await click('Undo'); expect(readTrioProgress(board, true)?.game.notes[0]).toBe(1)
})

it('records a single final tap once after the double-tap window', async () => {
  const board = new TrioGrid('2026-10-31-trio', raw[0]!.givens, raw[0]!.relations), offerSolve = vi.fn(async () => {})
  nearlySolved(board, 1, true); await mountDaily(board, offerSolve); await selectStar()
  const finishedAt = Date.now(); await tap(0)
  await act(async () => vi.advanceTimersByTime(501))
  expect(readStoredStats()).toHaveLength(1); expect(offerSolve).toHaveBeenCalledTimes(1)
  expect(readTrioProgress(board, true)).toBeNull()
  expect(readStoredStats()[0]!.elapsedMs).toBe(5000)
  expect(readStoredStats()[0]!.solvedAt).toBe(finishedAt)
})

it('records a pending winning tap before the page is hidden', async () => {
  const board = new TrioGrid('2026-10-31-trio', raw[0]!.givens, raw[0]!.relations), offerSolve = vi.fn(async () => {})
  nearlySolved(board, 1, true); await mountDaily(board, offerSolve); await selectStar(); await tap(0)
  await act(async () => window.dispatchEvent(new Event('pagehide')))
  expect(readStoredStats()).toHaveLength(1); expect(offerSolve).toHaveBeenCalledTimes(1)
  await act(async () => vi.advanceTimersByTime(501)); expect(offerSolve).toHaveBeenCalledTimes(1)
})

it('commits a pending winning tap before another control is used', async () => {
  const board = new TrioGrid('2026-10-31-trio', raw[0]!.givens, raw[0]!.relations), offerSolve = vi.fn(async () => {})
  nearlySolved(board, 1, true); await mountDaily(board, offerSolve); await selectStar(); await tap(0)
  await act(async () => button('Undo').dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })))
  expect(readStoredStats()).toHaveLength(1); expect(offerSolve).toHaveBeenCalledTimes(1)
  expect(readTrioProgress(board, true)).toBeNull()
})

it('records a pending winning tap when leaving the puzzle', async () => {
  const board = new TrioGrid('2026-10-31-trio', raw[0]!.givens, raw[0]!.relations), offerSolve = vi.fn(async () => {})
  nearlySolved(board, 1, true); await mountDaily(board, offerSolve); await selectStar(); await tap(0)
  await act(async () => root.unmount()); root = createRoot(container)
  expect(readStoredStats()).toHaveLength(1); expect(offerSolve).toHaveBeenCalledTimes(1)
  expect(readTrioProgress(board, true)).toBeNull()
})

it.each([false, true])('completes once when a double tap confirms the correct final note (Notes: %s)', async pencil => {
  const board = new TrioGrid('2026-10-31-trio', raw[0]!.givens, raw[0]!.relations), offerSolve = vi.fn(async () => {})
  nearlySolved(board, 3, true); await mountDaily(board, offerSolve)
  if (pencil) await click('Notes')
  await tap(0); await tap(0)
  expect(readStoredStats()).toHaveLength(1); expect(offerSolve).toHaveBeenCalledTimes(1)
  expect(readTrioProgress(board, true)).toBeNull()
})

it('completes immediately when the first tap places the matching final note', async () => {
  const board = new TrioGrid('2026-10-31-trio', raw[0]!.givens, raw[0]!.relations), offerSolve = vi.fn(async () => {})
  nearlySolved(board, 3, true); await mountDaily(board, offerSolve); await selectStar(); await tap(0)
  expect(readStoredStats()).toHaveLength(1); expect(offerSolve).toHaveBeenCalledTimes(1)
  await act(async () => vi.advanceTimersByTime(501)); expect(offerSolve).toHaveBeenCalledTimes(1)
})

it('finishes the first winning tap if the next gesture becomes a drag', async () => {
  const board = new TrioGrid('2026-10-31-trio', raw[0]!.givens, raw[0]!.relations), offerSolve = vi.fn(async () => {})
  nearlySolved(board, 1, true); await mountDaily(board, offerSolve); await selectStar(); await tap(0)
  await pointer('pointerdown', 0); await pointer('pointermove', 1); await pointer('pointerup', 1)
  expect(readStoredStats()).toHaveLength(1); expect(offerSolve).toHaveBeenCalledTimes(1)
  expect(readTrioProgress(board, true)).toBeNull()
})

it('preserves the saved board if a winning touch is held and then cancelled', async () => {
  const board = new TrioGrid('2026-10-31-trio', raw[0]!.givens, raw[0]!.relations), offerSolve = vi.fn(async () => {})
  nearlySolved(board, 1, true); await mountDaily(board, offerSolve); await selectStar(); await pointer('pointerdown', 0)
  await act(async () => vi.advanceTimersByTime(501))
  expect(readTrioProgress(board, true)?.game.notes[0]).toBe(1)
  await pointer('pointercancel', 0)
  expect(readStoredStats()).toEqual([]); expect(offerSolve).not.toHaveBeenCalled()
  expect(readTrioProgress(board, true)?.game.notes[0]).toBe(1)
})
