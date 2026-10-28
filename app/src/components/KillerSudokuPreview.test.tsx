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

it('plays and saves a Killer Sudoku preview with explained cage hints', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  localStorage.clear()
  const container = document.createElement('div'); document.body.append(container)
  const root = createRoot(container)
  try {
    await act(async () => root.render(<MemoryRouter><KillerSudokuPreviewPage /></MemoryRouter>))
    expect(container.querySelector('[aria-label="9 by 9 Killer Sudoku puzzle"]')).not.toBeNull()
    expect(container.querySelectorAll('.killer-sum').length).toBeGreaterThan(0)
    expect(container.querySelector('[aria-label="Get an explained hint"]')).not.toBeNull()
    expect(container.textContent).toContain('Hints explain cage deductions')
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
    expect(container.querySelector<HTMLButtonElement>('[aria-label="Get an explained hint"]')?.disabled).toBe(true)
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

it('explains a cage hint, applies it only when asked, and restores the move with Undo', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  HTMLElement.prototype.scrollIntoView = vi.fn()
  localStorage.clear()
  const board = parseKillerPreviews(raw)[0]!
  const { readSudokuProgress } = await import('../lib/sudokuProgress')
  const container = document.createElement('div'); document.body.append(container)
  const root = createRoot(container)
  const click = async (name: string) => {
    const button = [...container.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent === name || item.getAttribute('aria-label') === name)!
    await act(async () => button.click())
  }
  try {
    await act(async () => root.render(<MemoryRouter><KillerSudokuPreviewPage /></MemoryRouter>))
    await click('Get an explained hint')
    expect(container.querySelector('.hint-panel')?.textContent).toContain('cage')
    expect(container.querySelector('[data-hint="target"]')).not.toBeNull()
    expect(readSudokuProgress(board)?.hints).toBe(1)
    const before = readSudokuProgress(board)!.game
    await click('Apply move')
    expect(readSudokuProgress(board)!.game).not.toEqual(before)
    await click('Undo')
    expect(readSudokuProgress(board)!.game).toEqual(before)
    expect(readSudokuProgress(board)!.hints).toBe(1)
  } finally {
    await act(async () => root.unmount()); container.remove(); localStorage.clear(); vi.unstubAllGlobals()
  }
})

it('warns before revealing a wrong entry, and can undo the correction', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  HTMLElement.prototype.scrollIntoView = vi.fn()
  localStorage.clear()
  const board = parseKillerPreviews(raw)[0]!
  const { readSudokuProgress } = await import('../lib/sudokuProgress')
  const container = document.createElement('div'); document.body.append(container)
  const root = createRoot(container)
  const click = async (name: string) => {
    const button = [...container.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent === name || item.getAttribute('aria-label') === name)!
    await act(async () => button.click())
  }
  try {
    await act(async () => root.render(<MemoryRouter><KillerSudokuPreviewPage /></MemoryRouter>))
    await click('Enter 7'); await click('Get an explained hint')
    expect(container.querySelector('.hint-panel')?.textContent).toContain('Check your entries')
    expect(readSudokuProgress(board)?.hints).toBe(0)
    await click('Show the mistake')
    expect(readSudokuProgress(board)?.hints).toBe(1)
    expect(container.querySelector('.hint-panel')?.textContent).toContain('Clear this entry')
    await click('Apply move')
    expect(readSudokuProgress(board)?.game.cells[0]).toBe(0)
    await click('Undo')
    expect(readSudokuProgress(board)?.game.cells[0]).toBe(7)
  } finally {
    await act(async () => root.unmount()); container.remove(); localStorage.clear(); vi.unstubAllGlobals()
  }
})

it('saves crossed-out combinations per cage and restores them with Undo and Redo', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  localStorage.clear()
  const board = parseKillerPreviews(raw)[0]!
  const { readSudokuProgress } = await import('../lib/sudokuProgress')
  const container = document.createElement('div'); document.body.append(container)
  const root = createRoot(container)
  const click = async (name: string) => {
    const button = [...container.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent === name || item.getAttribute('aria-label') === name)!
    expect(button, name).toBeDefined()
    await act(async () => button.click())
  }
  try {
    await act(async () => root.render(<MemoryRouter><KillerSudokuPreviewPage /></MemoryRouter>))
    await click('Combinations')
    expect(container.querySelector('.killer-combinations')?.textContent).toContain('13 cage')
    await click('Cross out 4 + 9')
    expect(container.querySelector('[aria-label="Cross out 4 + 9"]')?.getAttribute('aria-pressed')).toBe('true')
    expect(readSudokuProgress(board)?.game.excludedCageCombinations?.[0]).toEqual([264])
    expect([...container.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'Reset')?.disabled).toBe(false)
    await click('Undo')
    expect(container.querySelector('[aria-label="Cross out 4 + 9"]')?.getAttribute('aria-pressed')).toBe('false')
    await click('Redo')
    expect(container.querySelector('[aria-label="Cross out 4 + 9"]')?.getAttribute('aria-pressed')).toBe('true')
    await click('Enter 6')
    expect(readSudokuProgress(board)?.game.excludedCageCombinations?.[0]).toEqual([264])
    await act(async () => container.querySelector<HTMLButtonElement>('[data-cell="1"]')!.click())
    expect(container.querySelector('.killer-combinations')?.textContent).toContain('8 cage')
    await act(async () => container.querySelector<HTMLButtonElement>('[data-cell="0"]')!.click())
    expect(container.querySelector('[aria-label="Cross out 4 + 9"]')?.getAttribute('aria-pressed')).toBe('true')
    expect(readSudokuProgress(board)?.hints).toBe(0)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    await click('Reset')
    expect(readSudokuProgress(board)?.game.excludedCageCombinations).toBeUndefined()
    await click('Undo')
    expect(readSudokuProgress(board)?.game.excludedCageCombinations?.[0]).toEqual([264])
    confirm.mockRestore()
    await act(async () => root.unmount())
    const restored = createRoot(container)
    await act(async () => restored.render(<MemoryRouter><KillerSudokuPreviewPage /></MemoryRouter>))
    await click('Combinations')
    expect(container.querySelector('[aria-label="Cross out 4 + 9"]')?.getAttribute('aria-pressed')).toBe('true')
    await act(async () => restored.unmount())
  } finally {
    container.remove(); localStorage.clear(); vi.unstubAllGlobals()
  }
})

it('shows combinations only when every selected cell belongs to the same cage', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  localStorage.clear()
  const container = document.createElement('div'); document.body.append(container)
  const root = createRoot(container)
  const select = async (index: number, shiftKey = false) => {
    const cell = container.querySelector<HTMLButtonElement>(`[data-cell="${index}"]`)!
    await act(async () => cell.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey })))
  }
  try {
    await act(async () => root.render(<MemoryRouter><KillerSudokuPreviewPage /></MemoryRouter>))
    const toggle = [...container.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'Combinations')!
    await act(async () => toggle.click())
    await select(9, true) // Same 13 cage as cell 0.
    expect(container.querySelector('.killer-combinations')?.textContent).toContain('13 cage')
    expect(container.querySelector('[aria-label="Cross out 4 + 9"]')).not.toBeNull()
    await select(1, true) // A cell in the 8 cage.
    expect(container.querySelector('.killer-combinations')?.textContent).toContain('Multiple cages selected')
    expect(container.querySelector('.killer-combinations')?.textContent).toContain('Select cells from one cage')
    expect(container.querySelector('[aria-label="Cross out 4 + 9"]')).toBeNull()
    expect(container.querySelectorAll('[data-cage-selected="true"]')).toHaveLength(0)
    expect(container.querySelector(`#${toggle.getAttribute('aria-controls')}`)).not.toBeNull()
    await select(1)
    expect(container.querySelector('.killer-combinations')?.textContent).toContain('8 cage')
  } finally {
    await act(async () => root.unmount()); container.remove(); localStorage.clear(); vi.unstubAllGlobals()
  }
})

it('resets only the current cage combinations as one saved undoable move', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  localStorage.clear()
  const board = parseKillerPreviews(raw)[0]!
  const { readSudokuProgress } = await import('../lib/sudokuProgress')
  const container = document.createElement('div'); document.body.append(container)
  let root = createRoot(container)
  const click = async (name: string) => {
    const button = [...container.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent === name || item.getAttribute('aria-label') === name)!
    expect(button, name).toBeDefined(); await act(async () => button.click())
  }
  const select = async (index: number) => act(async () => container.querySelector<HTMLButtonElement>(`[data-cell="${index}"]`)!.click())
  try {
    await act(async () => root.render(<MemoryRouter><KillerSudokuPreviewPage /></MemoryRouter>))
    await click('Combinations')
    expect([...container.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'Reset combinations')?.disabled).toBe(true)
    await click('Cross out 4 + 9'); await click('Cross out 5 + 8')
    await select(1); await click('Cross out 1 + 2 + 5')
    await select(0)
    const before = readSudokuProgress(board)!
    await click('Reset combinations')
    const after = readSudokuProgress(board)!
    expect(after.game.excludedCageCombinations?.[0]).toEqual([])
    expect(after.game.excludedCageCombinations?.[1]).toEqual([19])
    expect(after.game.cells).toEqual(before.game.cells)
    expect(after.game.notes).toEqual(before.game.notes)
    expect(after.hints).toBe(before.hints)
    await click('Undo')
    expect(readSudokuProgress(board)?.game.excludedCageCombinations?.[0]).toEqual([264, 144])
    await click('Redo')
    expect(readSudokuProgress(board)?.game.excludedCageCombinations?.[0]).toEqual([])
    await act(async () => root.unmount()); root = createRoot(container)
    await act(async () => root.render(<MemoryRouter><KillerSudokuPreviewPage /></MemoryRouter>))
    await click('Combinations')
    expect(container.querySelector('[aria-label="Cross out 4 + 9"]')?.getAttribute('aria-pressed')).toBe('false')
    await select(1)
    expect(container.querySelector('[aria-label="Cross out 1 + 2 + 5"]')?.getAttribute('aria-pressed')).toBe('true')
  } finally {
    await act(async () => root.unmount()); container.remove(); localStorage.clear(); vi.unstubAllGlobals()
  }
})
