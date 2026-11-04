// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import pilot from '@shared/docs/measurements/trio-pilot.json'
import raw from '../data/trio-previews.json'
import { createTrioGame, isTrioValue, trioConflicts, TrioGrid, type TrioGame, type TrioValue } from '../domain/trio'
import { readTrioProgress, storeTrioProgress } from '../lib/trioProgress'
import { TrioStage } from './TrioStage'

vi.mock('../lib/useLeaderboard', () => ({ useLeaderboard: () => ({ offerSolve: vi.fn() }) }))
const board = new TrioGrid('2026-11-04-trio', raw[0]!.givens, raw[0]!.relations)
const solution = pilot.samples[0]!.solution.map(value => { if (!isTrioValue(value)) throw Error('Invalid fixture'); return value })
const open = board.givens.flatMap((value, cell) => value === 0 ? [cell] : [])
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
async function mount(game: TrioGame, target = board) {
  storeTrioProgress(target, game, { elapsedMs: 0 }, true, 0)
  const puzzle = { id: target.id, puzzleType: 'trio' as const, seed: 1, generatorVersion: 1, board: target, difficulty: null }
  await act(async () => root.render(<MemoryRouter><TrioStage board={target} puzzle={puzzle} /></MemoryRouter>))
}

it('does not treat notes as placed symbols', async () => {
  const game = createTrioGame(board), notes = [...game.notes]; notes[open[0]!] = 7
  await mount({ ...game, notes }); await click('Check progress')
  expect(container.textContent).toContain('Place a symbol before checking your progress')
  expect(readTrioProgress(board, true)).toMatchObject({ game: { cells: game.cells, notes }, hints: 0 })
})

it('checks placed symbols for free without checking or changing notes', async () => {
  const game = createTrioGame(board), cells = [...game.cells], notes = [...game.notes]
  cells[open[0]!] = solution[open[0]!]!; notes[open[1]!] = 7
  await mount({ cells, notes }); await click('Check progress')
  expect(container.textContent).toContain('Your placed symbols are correct so far')
  expect(container.textContent).toContain('Notes are not checked')
  expect(container.querySelector('[data-hint="target"]')).toBeNull()
  expect(readTrioProgress(board, true)).toMatchObject({ game: { cells, notes }, hints: 0 })
})

it('reports a wrong symbol without revealing it until requested, then allows undo', async () => {
  vi.useFakeTimers()
  const game = createTrioGame(board)
  const wrong = open.flatMap(cell => ([1, 2, 3] as const).flatMap(value => {
    const cells = game.cells.map((original, i): TrioValue => i === cell ? value : original)
    return value !== solution[cell] && trioConflicts(board, cells).size === 0 ? [{ cell, value, cells }] : []
  }))[0]!
  await mount({ ...game, cells: wrong.cells }); await click('Check progress')
  expect(container.textContent).toContain('At least one placed symbol is incorrect')
  expect(container.querySelector('[data-hint="target"]')).toBeNull()
  expect(readTrioProgress(board, true)?.hints).toBe(0)
  await click('Show the mistake')
  expect(container.querySelector<HTMLElement>(`[data-cell="${wrong.cell}"]`)?.dataset['hint']).toBe('target')
  expect(readTrioProgress(board, true)?.hints).toBe(1)
  button('Apply move').focus()
  await act(async () => vi.advanceTimersByTime(1000))
  expect(document.activeElement).toBe(button('Apply move'))
  await click('Apply move')
  expect(readTrioProgress(board, true)?.game.cells[wrong.cell]).toBe(0)
  await click('Undo')
  expect(readTrioProgress(board, true)?.game.cells[wrong.cell]).toBe(wrong.value)
  expect(readTrioProgress(board, true)?.hints).toBe(1)
})

it('does not claim correctness for a puzzle with multiple solutions', async () => {
  const ambiguous = new TrioGrid('2026-11-03-trio', Array<TrioValue>(81).fill(0), [])
  const game = createTrioGame(ambiguous), cells = [...game.cells]; cells[0] = 1
  await mount({ ...game, cells }, ambiguous); await click('Check progress')
  expect(container.textContent).toContain('could not verify a unique solution')
  expect(container.querySelector('[data-hint="target"]')).toBeNull()
  expect(readTrioProgress(ambiguous, true)?.hints).toBe(0)
})
