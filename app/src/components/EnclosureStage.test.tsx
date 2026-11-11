// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { EnclosureGrid, enclosureFingerprint } from '../domain/enclosure'
import type { Puzzle } from '../domain/puzzle'
import { readStoredStats, STATS_STORAGE_KEY } from '../lib/stats'
import { EnclosureStage } from './EnclosureStage'
import { LeaderboardContext } from '../lib/useLeaderboard'
import { createLeaderboardStore } from '../lib/leaderboardProgress'

const grid = new EnclosureGrid(4, [0, 1, 2, 3, 4, 7, 8, 11, 12, 13, 14, 15], 5, 2, 4)
const puzzle: Puzzle = { id: '2000-01-02-enclosure', puzzleType: 'enclosure', board: grid, seed: 0, generatorVersion: 1, difficulty: null }
let container: HTMLDivElement, root: Root
const leaderboard = createLeaderboardStore(null, null, null)
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); localStorage.clear(); container = document.createElement('div'); document.body.append(container); root = createRoot(container) })
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
const cell = (i: number) => container.querySelector<HTMLButtonElement>(`[data-cell="${i}"]`)!
const button = (name: string) => [...container.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') ?? b.textContent) === name)!
const click = async (element: HTMLButtonElement) => { await act(async () => element.click()) }
const render = async (daily = true) => { await act(async () => root.render(<MemoryRouter><LeaderboardContext.Provider value={leaderboard}><EnclosureStage grid={grid} {...(daily ? { puzzle } : {})} /></LeaderboardContext.Provider></MemoryRouter>)) }

it('reveals only after submission without replacing the attempt or its first ranked result', async () => {
  const offered = vi.spyOn(leaderboard, 'offerSolve')
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ version: 1, id: puzzle.id, board: enclosureFingerprint(grid), walls: [] })))
  await render()
  expect(button('Show optimal solution')).toBeUndefined()
  expect(container.textContent).toContain('Optimal solution not saved for offline viewing yet.')
  await click(cell(6)); await click(cell(9)); await click(button('Submit enclosure'))
  const first = readStoredStats()[0]!
  expect(first.enclosureFirst?.score).toBe(1)
  const board = container.querySelector('[role="grid"]')!
  expect(button('Save best score').compareDocumentPosition(board) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
  expect(button('Show optimal solution').compareDocumentPosition(board) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0)
  await click(button('Show optimal solution'))
  const solution = container.querySelector('[aria-label="Optimal enclosure solution"]')!
  expect(solution).not.toBeNull()
  expect(container.querySelectorAll('[role="grid"]')).toHaveLength(1)
  expect(button('Save best score').disabled).toBe(true)
  expect(button('Undo').disabled).toBe(true)
  expect(solution.querySelectorAll('[data-wall="true"]')).toHaveLength(0)
  expect(solution.querySelector('[data-cell="6"]')?.getAttribute('aria-readonly')).toBe('true')
  expect(container.textContent).toContain('could not be saved for offline viewing')
  await click(cell(6))
  await act(async () => { cell(6).dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true })) })
  expect(readStoredStats()[0]).toEqual(first)
  await click(button('Hide optimal solution'))
  expect(cell(6).dataset['wall']).toBe('true')
  await click(button('Undo'))
  expect(cell(9).dataset['wall']).toBe('false')
  await click(button('Redo'))
  expect(cell(9).dataset['wall']).toBe('true')
  await click(cell(6)); await click(button('Save best score'))
  const improved = readStoredStats()[0]!
  expect(improved.enclosureBest?.score).toBe(3)
  expect(improved.enclosureFirst).toEqual(first.enclosureFirst)
  expect(improved.elapsedMs).toBe(first.elapsedMs)
  expect(offered).toHaveBeenCalledTimes(1)
  expect(offered.mock.calls[0]?.[0].enclosureFirst?.score).toBe(1)
  expect(container.querySelector('[aria-label="Optimal enclosure solution"]')).toBeNull()
  expect(cell(9).dataset['wall']).toBe('true')
})

it('keeps the reveal toggle focusable while loading an uncached solution', async () => {
  let respond!: (response: Response) => void
  vi.stubGlobal('fetch', () => new Promise<Response>(resolve => { respond = resolve }))
  await render(); await click(button('Submit enclosure'))
  button('Show optimal solution').focus()
  await click(button('Show optimal solution'))
  expect(button('Loading optimal solution…').disabled).toBe(false)
  expect(button('Loading optimal solution…').getAttribute('aria-disabled')).toBe('true')
  expect(document.activeElement).toBe(button('Loading optimal solution…'))
  await act(async () => respond(new Response(JSON.stringify({ version: 1, id: puzzle.id, board: enclosureFingerprint(grid), walls: [] }))))
  expect(document.activeElement).toBe(button('Hide optimal solution'))
})

it('keeps a legacy completion eligible to reveal without inventing a ranked first score', async () => {
  localStorage.setItem(STATS_STORAGE_KEY, JSON.stringify([{ id: puzzle.id, puzzleType: 'enclosure', size: 4, elapsedMs: 100, hints: 0, solvedAt: 1 }]))
  await render()
  expect(button('Show optimal solution')).toBeDefined()
  expect(container.textContent).toContain('original score was not recorded')
  await click(button('Submit enclosure'))
  expect(readStoredStats()[0]?.enclosureFirst).toBeUndefined()
})

it('lets a failed reveal retry without changing the board or scores', async () => {
  vi.stubGlobal('fetch', async () => new Response('missing', { status: 404 }))
  await render(); await click(button('Submit enclosure'))
  const first = readStoredStats()[0]!
  await click(button('Show optimal solution'))
  expect(container.textContent).toContain('Could not load a verified optimal solution')
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ version: 1, id: puzzle.id, board: enclosureFingerprint(grid), walls: [] })))
  await click(button('Retry optimal solution'))
  expect(container.querySelector('[aria-label="Optimal enclosure solution"]')).not.toBeNull()
  expect(readStoredStats()[0]).toEqual(first)
})

it('leaves text-field undo to the browser while editing leaderboard details', async () => {
  await render(); await click(cell(6))
  const nickname = document.createElement('input')
  container.querySelector('.enclosure-stage')!.append(nickname)
  const undo = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })
  await act(async () => { nickname.focus(); nickname.dispatchEvent(undo) })
  expect(undo.defaultPrevented).toBe(false)
  expect(cell(6).dataset['wall']).toBe('true')
})

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
  expect(button('Save best score').disabled).toBe(true)
  await click(cell(6)); await click(button('Save best score'))
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
  await click(cell(6)); await click(button('Save best score'))
  expect(readStoredStats()[0]?.elapsedMs).toBe(5000)
  await act(async () => root.unmount())
  root = createRoot(container)
  await render()
  now = 26000
  await click(cell(9)); await click(button('Save best score'))
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

it('retries a failed daily score even after the board changes', async () => {
  let now = 1000
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  await render(); await click(cell(6)); await click(cell(9))
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
  now = 6000; await click(button('Submit enclosure'))
  expect(readStoredStats()).toHaveLength(0)
  expect(container.textContent).toContain('Could not save your submitted score')
  await click(cell(6))
  write.mockRestore(); now = 16000
  await click(button('Retry saving score'))
  expect(readStoredStats()[0]?.enclosureBest?.score).toBe(1)
  expect(readStoredStats()[0]?.elapsedMs).toBe(5000)
  expect(container.textContent).not.toContain('Could not save your submitted score')
})

it('restores preview best and stopped time after switching boards and remounting', async () => {
  let now = 1000
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  await render(false); await click(cell(6)); now = 6000; await click(button('Submit enclosure'))
  await click(cell(9))
  await act(async () => root.unmount()); root = createRoot(container)
  now = 16000; await render(false)
  expect(container.textContent).toContain('Best score: 3')
  expect(cell(9).dataset['wall']).toBe('true')
  expect(container.querySelector('[aria-label="Elapsed active time"]')?.textContent).toContain('0:05')
  now = 26000; await click(cell(9)); await click(cell(6)); await click(button('Save best score'))
  expect(container.querySelector('[aria-label="Elapsed active time"]')?.textContent).toContain('0:05')
  expect(localStorage.getItem(STATS_STORAGE_KEY)).toBeNull()
})

it('uses the first daily completion time even if progress is stale', async () => {
  let now = 1000
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  await render(); await click(cell(6)); now = 6000; await click(button('Submit enclosure'))
  const key = `daily-puzzles.enclosure-progress.${puzzle.id}`
  const progress = JSON.parse(localStorage.getItem(key)!)
  progress.elapsedMs = 1000
  localStorage.setItem(key, JSON.stringify(progress))
  await act(async () => root.unmount()); root = createRoot(container); await render()
  expect(cell(6).dataset['wall']).toBe('true')
  expect(container.querySelector('[aria-label="Elapsed active time"]')?.textContent).toContain('0:05')
})
