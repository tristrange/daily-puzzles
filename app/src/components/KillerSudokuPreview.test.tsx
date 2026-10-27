// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { expect, it, vi } from 'vitest'
import { KillerSudokuPreviewPage } from '../pages/KillerSudokuPreviewPage'
import raw from '../data/killer-sudoku-previews.json'
import certificate from '../../../docs/measurements/killer-sudoku-preview.json'
import { parseKillerPreviews } from '../domain/killerSudoku'
import { storeSudokuProgress } from '../lib/sudokuProgress'

it('plays and saves a Killer Sudoku preview without exposing standard Sudoku hints', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  localStorage.clear()
  const container = document.createElement('div'); document.body.append(container)
  const root = createRoot(container)
  try {
    await act(async () => root.render(<MemoryRouter><KillerSudokuPreviewPage /></MemoryRouter>))
    expect(container.querySelector('[aria-label="9 by 9 Killer Sudoku puzzle"]')).not.toBeNull()
    expect(container.querySelectorAll('.killer-sum').length).toBeGreaterThan(0)
    expect(container.querySelector('[aria-label="Get an explained hint"]')).toBeNull()
    expect(container.textContent).toContain('Hints are not available yet')
    const enter = container.querySelector<HTMLButtonElement>('[aria-label="Enter 6"]')!
    await act(async () => enter.click())
    expect(container.querySelector('[data-cell="0"]')?.getAttribute('aria-label')).toContain('6')
    expect(localStorage.getItem('daily-puzzles.sudoku-preview.v1.killer-preview-1')).not.toBeNull()
    const undo = [...container.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'Undo')!
    await act(async () => undo.click())
    expect(container.querySelector('[data-cell="0"]')?.getAttribute('aria-label')).toContain('Empty')
  } finally {
    await act(async () => root.unmount()); container.remove(); localStorage.clear(); vi.unstubAllGlobals()
  }
})


it('completes a board only after the cages and Sudoku rules are satisfied', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  localStorage.clear()
  const board = parseKillerPreviews(raw)[0]!, solution = certificate.samples[0]!.solution
  const cells = [...solution]; cells[0] = 0
  storeSudokuProgress(board, { cells, notes: Array<number>(81).fill(0) }, { elapsedMs: 0 }, 0)
  const container = document.createElement('div'); document.body.append(container)
  const root = createRoot(container)
  try {
    await act(async () => root.render(<MemoryRouter><KillerSudokuPreviewPage /></MemoryRouter>))
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Enter 6"]')!.click())
    expect(container.textContent).toContain('Solved in')
    expect(localStorage.getItem('daily-puzzles.sudoku-preview.v1.killer-preview-1')).toBeNull()
    expect(container.querySelector('[aria-label="Get an explained hint"]')).toBeNull()
  } finally {
    await act(async () => root.unmount()); container.remove(); localStorage.clear(); vi.unstubAllGlobals()
  }
})

it('keeps a filled Sudoku that violates cage totals as an unfinished attempt', async () => {
  const board = { ...parseKillerPreviews(raw)[0]!, givens: Array<number>(81).fill(0) }
  const cells = certificate.samples[0]!.solution.map(value => value === 1 ? 2 : value === 2 ? 1 : value)
  const { readSudokuProgress } = await import('../lib/sudokuProgress')
  localStorage.clear()
  try {
    expect(storeSudokuProgress(board, { cells, notes: Array<number>(81).fill(0) }, { elapsedMs: 2000 }, 0)).toBe(true)
    expect(readSudokuProgress(board)?.game.cells).toEqual(cells)
  } finally { localStorage.clear() }
})
