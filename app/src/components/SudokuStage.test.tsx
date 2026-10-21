// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import raw from '../data/sudoku-previews.json'
import playtest from '../domain/fixtures/sudoku-hard-playtest.json'
import proof from '../../../docs/measurements/sudoku-preview.json'
import { parseSudokuBoards } from '../domain/sudoku'
import { readSudokuProgress, storeSudokuProgress } from '../lib/sudokuProgress'
import { SudokuStage } from './SudokuStage'

const board = parseSudokuBoards(raw)[0]!, index = board.givens.indexOf(0)
let container: HTMLDivElement, root: Root
beforeEach(() => {
  localStorage.clear(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  HTMLElement.prototype.scrollIntoView = vi.fn()
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); localStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
const cell = (i: number) => container.querySelector<HTMLButtonElement>(`[data-cell="${i}"]`)!
async function click(name: string) {
  const button = [...container.querySelectorAll<HTMLButtonElement>('button')].find(el => el.textContent?.trim() === name || el.getAttribute('aria-label') === name)!
  expect(button, name).toBeDefined(); await act(async () => button.click())
}
async function mount() { await act(async () => root.render(<SudokuStage board={board} />)) }

it('selects without editing, enters notes/values, clears notes and restores full history', async () => {
  await mount()
  await act(async () => cell(index).click())
  expect(readSudokuProgress(board)).toBeNull()
  await click('Notes'); await click('Enter 9')
  expect(readSudokuProgress(board)?.game.notes[index]).toBe(256)
  await click('Clear notes'); expect(readSudokuProgress(board)?.game.notes[index]).toBe(0)
  await click('Undo'); expect(readSudokuProgress(board)?.game.notes[index]).toBe(256)
  await click('Redo'); expect(readSudokuProgress(board)?.game.notes[index]).toBe(0)
  await click('Notes'); await click('Enter 4')
  expect(readSudokuProgress(board)?.game.cells[index]).toBe(4)
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  await click('Reset'); expect(readSudokuProgress(board)?.game.cells[index]).toBe(4)
  confirm.mockReturnValue(true)
  await click('Reset'); expect(readSudokuProgress(board)?.game.cells[index]).toBe(0)
  await click('Undo'); expect(readSudokuProgress(board)?.game.cells[index]).toBe(4)
  await click('Undo'); await click('Enter 5')
  expect([...container.querySelectorAll('button')].find(b => b.textContent === 'Redo')?.disabled).toBe(true)
  await act(async () => cell(board.givens.findIndex(Boolean)).click())
  expect(container.querySelector<HTMLButtonElement>('[aria-label="Enter 1"]')?.disabled).toBe(true)
})

it('warns freely, then counts a revealed correction before optionally applying it', async () => {
  await mount()
  const wrong = proof.samples[0]!.solution[index]! % 9 + 1
  await click(`Enter ${wrong}`); await click('Get an explained hint')
  expect(container.textContent).toContain('Check your entries')
  expect(container.querySelector('[data-hint="target"]')).toBeNull()
  expect(readSudokuProgress(board)?.hints).toBe(0)
  expect(container.textContent).not.toContain('Apply move')
  await click('Show the mistake')
  expect(cell(index).dataset['hint']).toBe('target')
  expect(readSudokuProgress(board)?.hints).toBe(1)
  expect(readSudokuProgress(board)?.game.cells[index]).toBe(wrong)
  await click('Apply move'); expect(readSudokuProgress(board)?.game.cells[index]).toBe(0)
  await click('Undo'); expect(readSudokuProgress(board)?.game.cells[index]).toBe(wrong)
  expect(readSudokuProgress(board)?.hints).toBe(1)
})

it('dismisses a hint from its focused board target and returns focus to Hint', async () => {
  await mount(); await click('Get an explained hint')
  await act(async () => container.querySelector<HTMLButtonElement>('.hint-location')!.click())
  const target = container.querySelector<HTMLButtonElement>('[data-hint="target"]')!
  expect(document.activeElement).toBe(target)
  await act(async () => target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  expect(container.querySelector('.hint-panel')).toBeNull()
  expect(document.activeElement?.getAttribute('aria-label')).toBe('Get an explained hint')
})

it('resumes notes/time and completes through keyboard input without daily stats', async () => {
  await mount(); await click('Notes'); await click('Enter 9')
  await act(async () => root.unmount()); root = createRoot(container); await mount()
  expect(cell(index).getAttribute('aria-label')).toContain('notes 9')
  for (const [i, value] of proof.samples[0]!.solution.entries()) if (!board.givens[i]) {
    await act(async () => { cell(i).focus(); cell(i).dispatchEvent(new KeyboardEvent('keydown', { key: String(value), bubbles: true })) })
  }
  expect(container.textContent).toContain('Solved in')
  expect(readSudokuProgress(board)).toBeNull()
  expect(localStorage.getItem('daily-puzzles:stats')).toBeNull()
})


it('cleans peer notes in the same saved, undoable move as number entry', async () => {
  const notes = Array<number>(81).fill(0); notes[2] = 96 // 6, 7, same row as first cell
  storeSudokuProgress(board, { cells: [...board.givens], notes }, 0, 0)
  await mount(); await click('Enter 6')
  expect(readSudokuProgress(board)?.game.notes[2]).toBe(64)
  await click('Undo'); expect(readSudokuProgress(board)?.game.notes[2]).toBe(96)
  expect(readSudokuProgress(board)?.game.cells[0]).toBe(0)
  await click('Redo'); expect(readSudokuProgress(board)?.game.notes[2]).toBe(64)
})

it('highlights matching digits and their rows/columns, and clears them on an empty selection', async () => {
  await mount()
  await act(async () => cell(1).click()) // given 1, also at R2C6 and R4C1
  expect(cell(1).dataset['selected']).toBe('true')
  expect(cell(14).dataset['match']).toBe('true')
  expect(cell(27).dataset['match']).toBe('true')
  expect(cell(36).dataset['digitLine']).toBe('true') // column 1 of another 1
  expect(cell(36).dataset['context']).toBe('false') // not selected cell's peers
  expect(cell(29).dataset['match']).toBe('false') // another filled digit
  await act(async () => cell(0).click())
  expect(container.querySelector('[data-match="true"]')).toBeNull()
  expect(container.querySelector('[data-digit-line="true"]')).toBeNull()
})

it('collapses supporting deductions without hiding the conclusion or Apply action', async () => {
  const hard = parseSudokuBoards(raw)[2]!
  storeSudokuProgress(hard, { cells: playtest.cells.flat(), notes: playtest.notes.flat().map(text => [...text].reduce((mask, digit) => mask | (1 << (Number(digit) - 1)), 0)) }, 0, 0)
  await act(async () => root.render(<SudokuStage board={hard} />)); await click('Get an explained hint')
  const details = container.querySelector<HTMLDetailsElement>('.hint-panel details')!
  expect(details).not.toBeNull()
  expect(details.open).toBe(false)
  expect(container.querySelector('.hint-panel > ol')?.children).toHaveLength(1)
  expect(container.querySelector('.hint-effect')?.textContent).toContain('1, 2, 3, 4, 7')
  await act(async () => { details.open = true })
  expect(details.textContent).toContain('R2C2: 4, 5')
  expect(readSudokuProgress(hard)?.hints).toBe(1)
  await click('Apply move'); expect(readSudokuProgress(hard)?.game.notes[59]).toBe(79)
})
