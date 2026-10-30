// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import queens from '../../public/puzzles/2026-10-27.json'
import star from '../../public/puzzles/2026-10-27-star.json'
import tracks from '../../public/puzzles/2026-10-27-tracks-large.json'
import words from '../../public/puzzles/2026-10-27-words.json'
import trio from '../../public/puzzles/2026-10-27-trio.json'
import tents from '../../public/puzzles/2026-10-27-tents.json'
import sudoku from '../../public/puzzles/2026-10-27-sudoku-hard.json'
import nurikabe from '../../public/puzzles/2026-10-27-nurikabe.json'
import killer from '../../public/puzzles/2026-10-27-killer-sudoku-hard.json'
import { parsePuzzle } from '../domain/puzzle'
import { loadPuzzle } from '../lib/puzzles'
import { copyText, puzzleShareLink } from '../lib/share'
import { PuzzleView } from './PuzzleView'

vi.mock('../lib/useLeaderboard', () => ({ useLeaderboard: () => ({ offerSolve: vi.fn(), status: 'disabled' }) }))
vi.mock('../lib/puzzles', async original => ({
  ...await original<typeof import('../lib/puzzles')>(),
  loadPuzzle: vi.fn(),
}))
vi.mock('../lib/share', async original => ({
  ...await original<typeof import('../lib/share')>(),
  copyText: vi.fn(),
}))

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  vi.mocked(copyText).mockReset()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  localStorage.clear()
  sessionStorage.clear()
  vi.clearAllMocks()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function render(raw: unknown) {
  const puzzle = parsePuzzle(raw)
  vi.mocked(loadPuzzle).mockResolvedValue(puzzle)
  await act(async () => {
    root.render(<MemoryRouter><PuzzleView id={puzzle.id} /></MemoryRouter>)
    await vi.dynamicImportSettled()
  })
  return puzzle
}

async function clickCopy() {
  const button = [...container.querySelectorAll('button')].find(button => button.textContent === 'Copy puzzle link')
  if (!button) throw Error('Copy puzzle link button is missing')
  await act(async () => {
    button.click()
    await Promise.resolve()
  })
}

const games = [
  { label: 'Queens', raw: queens },
  { label: 'Star Battle', raw: star },
  { label: 'Train Tracks', raw: tracks },
  { label: 'Word Paths', raw: words },
  { label: 'Trio', raw: trio },
  { label: 'Tents', raw: tents },
  { label: 'Sudoku', raw: sudoku },
  { label: 'Nurikabe', raw: nurikabe },
  { label: 'Killer Sudoku', raw: killer },
] as const

it.each(games)('offers the copy link before solving $label', async ({ raw }) => {
  await render(raw)
  expect(container.querySelector('.solved-panel')).toBeNull()
  expect([...container.querySelectorAll('button')].some(button => button.textContent === 'Copy puzzle link')).toBe(true)
})

it('copies the exact variant link and announces success', async () => {
  vi.mocked(copyText).mockResolvedValue(true)
  const puzzle = await render(tracks)
  await clickCopy()
  const link = puzzleShareLink(puzzle.id)

  expect(copyText).toHaveBeenCalledTimes(1)
  expect(copyText).toHaveBeenCalledWith(link)
  expect(link).toMatch(/\/#\/archive\/2026-10-27-tracks-large$/)
  expect(link).not.toContain('?')
  expect(container.querySelector('.puzzle-link-copy')?.textContent).toBe('Link copied')
  expect(container.querySelector('.puzzle-link-share [role="status"]')?.textContent).toBe(
    'Puzzle link copied to the clipboard.',
  )
  expect(container.querySelector('input[aria-label="Puzzle link"]')).toBeNull()
})

it('shows a selectable link when copying fails', async () => {
  vi.mocked(copyText).mockResolvedValue(false)
  const puzzle = await render(queens)
  await clickCopy()
  const field = container.querySelector<HTMLInputElement>('input[aria-label="Puzzle link"]')

  expect(field).not.toBeNull()
  expect(field!.readOnly).toBe(true)
  expect(field!.value).toBe(puzzleShareLink(puzzle.id))
  expect(field!.value).not.toContain('?')
  expect(field!.selectionStart).toBe(0)
  expect(field!.selectionEnd).toBe(field!.value.length)
  expect(container.querySelector('.puzzle-link-share [role="status"]')?.textContent).toBe(
    'Could not reach the clipboard — the puzzle link is shown below, ready to copy.',
  )
  expect(container.querySelector('.puzzle-link-share [role="status"]')?.classList.contains('sr-only')).toBe(false)
})
