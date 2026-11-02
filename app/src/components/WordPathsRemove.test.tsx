// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Puzzle } from '../domain/puzzle'
import { createWordGame, submitWord, type WordGame } from '../domain/wordGame'
import { WordGrid } from '../domain/wordPaths'
import { readStoredStats } from '../lib/stats'
import { readWordProgress, storeWordProgress } from '../lib/wordProgress'
import { WordPathsStage } from './WordPathsStage'

vi.mock('../lib/useLeaderboard', () => ({ useLeaderboard: () => ({ offerSolve: vi.fn() }) }))

const grid = new WordGrid(6, 3, [
  'C', 'A', 'T', null, null, null,
  'L', 'I', 'O', 'N', null, null,
  'B', 'R', 'E', 'A', 'D', null,
], [3, 4, 5], 2)
const puzzle: Puzzle = { id: '2026-10-19-words', puzzleType: 'word-paths', seed: 1, generatorVersion: 2, board: grid, difficulty: null }
let container: HTMLDivElement, root: Root, now: number

function accepted(game: WordGame, path: readonly number[]): WordGame {
  const result = submitWord({ ...game, trace: path })
  if (!result.accepted) throw Error(result.message)
  return result.game
}

function started(trace: readonly number[] = [12, 13]): WordGame {
  const cat = accepted(createWordGame(grid), [0, 1, 2])
  return { ...accepted(cat, [6, 7, 8, 9]), trace }
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  now = 1000
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  Element.prototype.scrollIntoView = vi.fn()
  localStorage.clear()
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove(); localStorage.clear(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals()
})

async function mount() {
  await act(async () => root.render(<MemoryRouter><WordPathsStage puzzle={puzzle} grid={grid} timeZone="UTC" /></MemoryRouter>))
}

async function click(label: string) {
  const element = [...container.querySelectorAll<HTMLButtonElement>('button')]
    .find(button => button.getAttribute('aria-label') === label || button.textContent === label)
  if (!element) throw Error(`Missing button: ${label}`)
  await act(async () => element.click())
}

it('removes an earlier word, preserves other work and supports Undo, Redo and reload', async () => {
  storeWordProgress(puzzle.id, started(), { elapsedMs: 65000, attemptElapsedMs: 12000 }, false, 3)
  await mount()
  await click('Hint')
  expect(container.querySelector('.hint-panel')).not.toBeNull()
  expect(readWordProgress(puzzle.id, grid)?.hints).toBe(4)
  now = 5000
  await click('Remove CAT, 3 letters')
  const saved = readWordProgress(puzzle.id, grid)
  expect(saved).toMatchObject({ game: { words: [[6, 7, 8, 9]], trace: [12, 13] }, elapsedMs: 69000, attemptElapsedMs: 16000, hints: 4 })
  expect(container.querySelector('[data-cell="0"]')?.getAttribute('aria-disabled')).toBe('false')
  expect(container.querySelector('[data-cell="6"]')?.getAttribute('aria-disabled')).toBe('true')
  expect(document.activeElement?.getAttribute('data-cell')).toBe('0')
  expect(container.querySelector('.hint-panel')).toBeNull()
  expect(container.textContent).toContain('Removed CAT')
  await click('Undo')
  expect(readWordProgress(puzzle.id, grid)?.game.words).toEqual([[0, 1, 2], [6, 7, 8, 9]])
  await click('Redo')
  expect(readWordProgress(puzzle.id, grid)?.game.words).toEqual([[6, 7, 8, 9]])
  await act(async () => root.unmount()); root = createRoot(container)
  await mount()
  expect(readWordProgress(puzzle.id, grid)).toMatchObject({ game: { words: [[6, 7, 8, 9]], trace: [12, 13] }, hints: 4 })
})

it('keeps accepted words locked after solving and preserves the recorded result', async () => {
  storeWordProgress(puzzle.id, started([12, 13, 14, 15, 16]), { elapsedMs: 65000 }, false, 2)
  await mount()
  await click('Submit word')
  expect(readStoredStats()).toMatchObject([{ id: puzzle.id, hints: 2 }])
  expect(container.querySelector('button[aria-label^="Remove "]')).toBeNull()
  expect(readWordProgress(puzzle.id, grid)).toBeNull()
})
