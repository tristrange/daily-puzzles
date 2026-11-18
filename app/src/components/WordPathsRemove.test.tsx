// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Puzzle } from '../domain/puzzle'
import { createWordGame, submitWord, type WordGame } from '../domain/wordGame'
import { WordGrid } from '../domain/wordPaths'
import { readStoredStats, storeSolve, STATS_STORAGE_KEY, type SolveRecord } from '../lib/stats'
import { readWordProgress, storeWordProgress } from '../lib/wordProgress'
import { WordPathsStage } from './WordPathsStage'

const publication = vi.hoisted(() => ({ offerSolve: vi.fn() }))
vi.mock('../lib/useLeaderboard', () => ({ useLeaderboard: () => publication }))

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
  publication.offerSolve.mockClear()
  localStorage.clear()
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove(); localStorage.clear(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals()
})

async function mount(preview = false) {
  await act(async () => root.render(<MemoryRouter>
    <WordPathsStage puzzle={puzzle} grid={grid} timeZone="UTC" {...(preview ? { previewBoard: 1 } : {})} />
  </MemoryRouter>))
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

it('keeps the last word ready to submit after a failed save and retries the original result', async () => {
  const unfinished = started([12, 13, 14, 15, 16])
  storeWordProgress(puzzle.id, unfinished, { elapsedMs: 65000, attemptElapsedMs: 12000 }, false, 2)
  await mount()

  const setItem = Storage.prototype.setItem
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
    if (key === STATS_STORAGE_KEY) throw new DOMException('Storage quota exceeded', 'QuotaExceededError')
    setItem.call(this, key, value)
  })
  const solvedAt = vi.spyOn(Date, 'now').mockReturnValue(10_000)
  now = 5000
  await click('Submit word')

  expect(container.querySelector('[role="alert"]')?.textContent).toMatch(/Could not save your solve/)
  expect(readWordProgress(puzzle.id, grid)).toMatchObject({
    game: unfinished, elapsedMs: 69000, attemptElapsedMs: 16000, hints: 2,
  })
  expect(readStoredStats()).toEqual([])
  expect(publication.offerSolve).not.toHaveBeenCalled()

  write.mockRestore()
  solvedAt.mockReturnValue(20_000)
  now = 15000
  await click('Retry saving solve')
  expect(readStoredStats()).toMatchObject([{
    id: puzzle.id, elapsedMs: 69000, attemptElapsedMs: 16000, hints: 2, solvedAt: 10_000,
  }])
  expect(publication.offerSolve).toHaveBeenCalledExactlyOnceWith(readStoredStats()[0])
  expect(readWordProgress(puzzle.id, grid)).toBeNull()
})

it.each(['replay', 'preview'])('preserves the daily first solve when finishing a Word Paths %s', async mode => {
  const preview = mode === 'preview'
  const first: SolveRecord = {
    id: puzzle.id, puzzleType: 'word-paths', size: grid.width, elapsedMs: 42000, hints: 1, solvedAt: 1000,
  }
  storeSolve(first)
  storeWordProgress(puzzle.id, started(), { elapsedMs: 70000 }, false, 3)
  storeWordProgress(puzzle.id, started([12, 13, 14, 15, 16]), { elapsedMs: 65000 }, preview, 2)
  await mount(preview)
  await click('Submit word')

  expect(readWordProgress(puzzle.id, grid, preview)).toBeNull()
  expect(readStoredStats()).toEqual([first])
  expect(publication.offerSolve).not.toHaveBeenCalled()
  if (preview) expect(readWordProgress(puzzle.id, grid)).toMatchObject({ elapsedMs: 70000, hints: 3 })
  else expect(container.textContent).toContain('Solved again — your first solve, 0:42, still counts.')
})
