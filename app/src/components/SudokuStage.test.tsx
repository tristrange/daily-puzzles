// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import raw from '../data/sudoku-previews.json'
import killerRaw from '../data/killer-sudoku-previews.json'
import playtest from '../domain/fixtures/sudoku-hard-playtest.json'
import proof from '../../../docs/measurements/sudoku-preview.json'
import type { Puzzle } from '../domain/puzzle'
import { readStoredStats } from '../lib/stats'
import { LeaderboardContext } from '../lib/useLeaderboard'
import { createLeaderboardStore } from '../lib/leaderboardProgress'
import { MemoryRouter } from 'react-router-dom'
import { parseSudokuBoards } from '../domain/sudoku'
import { parseKillerPreviews } from '../domain/killerSudoku'
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
async function pointer(type: string, i: number, pointerType = 'mouse', pointerId = 1, options: MouseEventInit = {}) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: i, ...options })
  Object.defineProperties(event, { pointerId: { value: pointerId }, pointerType: { value: pointerType } })
  await act(async () => cell(i).dispatchEvent(event))
}
function pointerEnvironment() {
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: (x: number) => cell(x) })
  HTMLElement.prototype.setPointerCapture = vi.fn()
  HTMLElement.prototype.hasPointerCapture = () => true
  HTMLElement.prototype.releasePointerCapture = vi.fn()
}

async function tap(i: number, pointerType = 'mouse') {
  await pointer('pointerdown', i, pointerType)
  await pointer('pointerup', i, pointerType)
}

it.each(['mouse', 'touch'])('places a single note with two %s taps and keeps the whole move undoable', async pointerType => {
  const notes = Array<number>(81).fill(0)
  notes[0] = 32; notes[2] = 96 // 6 in the target; 6 and 7 in a peer
  storeSudokuProgress(board, { cells: [...board.givens], notes }, { elapsedMs: 0 }, 0)
  await mount(); pointerEnvironment()
  if (pointerType === 'touch') await click('Notes')
  await tap(0, pointerType)
  expect(readSudokuProgress(board)?.game.cells[0]).toBe(0)
  await tap(0, pointerType)
  expect(readSudokuProgress(board)?.game.cells[0]).toBe(6)
  expect(readSudokuProgress(board)?.game.notes.slice(0, 3)).toEqual([0, 0, 64])
  expect(container.querySelector('[aria-pressed="true"]')?.textContent).toBe(pointerType === 'touch' ? 'Notes' : undefined)
  await click('Undo')
  expect(readSudokuProgress(board)?.game.cells[0]).toBe(0)
  expect(readSudokuProgress(board)?.game.notes.slice(0, 3)).toEqual([32, 0, 96])
  await click('Redo')
  expect(readSudokuProgress(board)?.game.cells[0]).toBe(6)
  expect(readSudokuProgress(board)?.game.notes[2]).toBe(64)
})

it('uses the Killer Sudoku entry rules when confirming a single note', async () => {
  const killer = parseKillerPreviews(killerRaw)[0]!, notes = Array<number>(81).fill(0)
  notes[6] = 32; notes[14] = 96 // same cage, but different row, column and box
  storeSudokuProgress(killer, { cells: [...killer.givens], notes }, { elapsedMs: 0 }, 0)
  await act(async () => root.render(<SudokuStage board={killer} />)); pointerEnvironment()
  await tap(6, 'touch'); await tap(6, 'touch')
  expect(readSudokuProgress(killer)?.game.cells[6]).toBe(6)
  expect(readSudokuProgress(killer)?.game.notes[14]).toBe(64)
  await click('Undo')
  expect(readSudokuProgress(killer)?.game.cells[6]).toBe(0)
  expect(readSudokuProgress(killer)?.game.notes[14]).toBe(96)
})

it('does not turn zero notes, multiple notes, or a given into a value', async () => {
  const notes = Array<number>(81).fill(0); notes[2] = 96
  storeSudokuProgress(board, { cells: [...board.givens], notes }, { elapsedMs: 0 }, 0)
  await mount(); pointerEnvironment()
  for (const i of [0, 2, 1]) { await tap(i); await tap(i) }
  expect(readSudokuProgress(board)?.game.cells.slice(0, 3)).toEqual([0, 1, 0])
  expect(readSudokuProgress(board)?.game.notes[2]).toBe(96)
  expect([...container.querySelectorAll('button')].find(button => button.textContent === 'Undo')?.disabled).toBe(true)
})

it('does not confuse a drag, cancelled touch, different cell, or slow taps with a double tap', async () => {
  const notes = Array<number>(81).fill(0); notes[0] = 32
  storeSudokuProgress(board, { cells: [...board.givens], notes }, { elapsedMs: 0 }, 0)
  let now = 1000
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  await mount(); pointerEnvironment()
  await tap(0, 'touch'); await tap(2, 'touch'); await tap(0, 'touch')
  expect(readSudokuProgress(board)?.game.cells[0]).toBe(0)
  await pointer('pointerdown', 0, 'touch'); await pointer('pointermove', 2, 'touch'); await pointer('pointerup', 2, 'touch')
  expect(container.querySelectorAll('[aria-selected="true"]')).toHaveLength(2)
  await tap(0, 'touch')
  expect(readSudokuProgress(board)?.game.cells[0]).toBe(0)
  await pointer('pointerdown', 0, 'touch'); await pointer('pointercancel', 0, 'touch'); await tap(0, 'touch')
  expect(readSudokuProgress(board)?.game.cells[0]).toBe(0)
  now += 1000
  await tap(0, 'touch')
  expect(readSudokuProgress(board)?.game.cells[0]).toBe(0)
})

it('keeps Shift selections and keyboard-style clicks from confirming notes', async () => {
  const notes = Array<number>(81).fill(0); notes[0] = 32
  storeSudokuProgress(board, { cells: [...board.givens], notes }, { elapsedMs: 0 }, 0)
  await mount(); pointerEnvironment()
  await tap(2)
  for (let i = 0; i < 2; i++) {
    await pointer('pointerdown', 0, 'mouse', 1, { shiftKey: true })
    await pointer('pointerup', 0, 'mouse', 1, { shiftKey: true })
  }
  expect(container.querySelectorAll('[aria-selected="true"]')).toHaveLength(2)
  expect(readSudokuProgress(board)?.game.cells[0]).toBe(0)
  await act(async () => { cell(0).click(); cell(0).click() })
  expect(readSudokuProgress(board)?.game.cells[0]).toBe(0)
})

it('requires the same single note on both taps', async () => {
  const notes = Array<number>(81).fill(0); notes[0] = 32
  storeSudokuProgress(board, { cells: [...board.givens], notes }, { elapsedMs: 0 }, 0)
  await mount(); pointerEnvironment()
  await tap(0); await click('Notes'); await click('Enter 7'); await click('Enter 6')
  await tap(0)
  expect(readSudokuProgress(board)?.game.cells[0]).toBe(0)
  await tap(0)
  expect(readSudokuProgress(board)?.game.cells[0]).toBe(7)
})

it('forgets the first tap when another control is used', async () => {
  const notes = Array<number>(81).fill(0); notes[0] = 32
  storeSudokuProgress(board, { cells: [...board.givens], notes }, { elapsedMs: 0 }, 0)
  await mount(); pointerEnvironment(); await tap(0, 'touch')
  const notesButton = [...container.querySelectorAll('button')].find(button => button.textContent === 'Notes')!
  await act(async () => {
    notesButton.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    notesButton.click()
  })
  await tap(0, 'touch')
  expect(readSudokuProgress(board)?.game.cells[0]).toBe(0)
})

it('does not confirm after a long press or movement within a cell', async () => {
  const notes = Array<number>(81).fill(0); notes[0] = 32
  storeSudokuProgress(board, { cells: [...board.givens], notes }, { elapsedMs: 0 }, 0)
  let now = 1000
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  await mount(); pointerEnvironment()
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => cell(0) })
  await tap(0, 'touch')
  await pointer('pointerdown', 0, 'touch')
  await pointer('pointermove', 0, 'touch', 1, { clientX: 20 })
  await pointer('pointerup', 0, 'touch')
  await tap(0, 'touch')
  expect(readSudokuProgress(board)?.game.cells[0]).toBe(0)
  await pointer('pointerdown', 0, 'touch'); now += 600; await pointer('pointerup', 0, 'touch')
  await tap(0, 'touch')
  expect(readSudokuProgress(board)?.game.cells[0]).toBe(0)
})

it('finishes the puzzle when the confirmed note is the last value', async () => {
  const cells = [...proof.samples[0]!.solution], notes = Array<number>(81).fill(0)
  notes[index] = 1 << (cells[index]! - 1); cells[index] = 0
  storeSudokuProgress(board, { cells, notes }, { elapsedMs: 0 }, 0)
  await mount(); pointerEnvironment()
  await tap(index, 'touch'); await tap(index, 'touch')
  expect(container.textContent).toContain('Solved in')
  expect(readSudokuProgress(board)).toBeNull()
})

it.each(['mouse', 'touch'])('drag-selects with %s and edits group notes as one saved move', async pointerType => {
  const cells = [...board.givens], notes = Array<number>(81).fill(0)
  cells[4] = 6; notes[0] = 256
  storeSudokuProgress(board, { cells, notes }, { elapsedMs: 0 }, 0)
  await mount(); pointerEnvironment()
  await pointer('pointerdown', 0, pointerType)
  if (pointerType === 'touch') await pointer('lostpointercapture', 0, pointerType) // implicit cell capture transfers to the grid
  for (const i of [1, 2, 3, 4, 2]) await pointer('pointermove', i, pointerType)
  await pointer('pointerup', 2, pointerType)
  await act(async () => cell(2).dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })))
  expect(container.querySelectorAll('[aria-selected="true"]')).toHaveLength(5)
  expect(container.querySelector('[role="grid"]')?.getAttribute('aria-multiselectable')).toBe('true')
  expect(readSudokuProgress(board)?.game.notes[2]).toBe(0) // selection itself never edits
  await click('Enter 9')
  expect(readSudokuProgress(board)?.game.notes.slice(0, 5)).toEqual([256, 0, 256, 0, 0])
  expect(readSudokuProgress(board)?.game.cells.slice(0, 5)).toEqual([0, 1, 0, 3, 6])
  expect([...container.querySelectorAll('button')].find(b => b.textContent === 'Notes')?.getAttribute('aria-pressed')).toBe('false')
  await click('Undo'); expect(readSudokuProgress(board)?.game.notes.slice(0, 5)).toEqual([256, 0, 0, 0, 0])
  await click('Redo'); await click('Enter 9')
  expect(readSudokuProgress(board)?.game.notes.slice(0, 5)).toEqual([0, 0, 0, 0, 0])
  await click('Undo'); await click('Erase')
  expect(readSudokuProgress(board)?.game.cells[4]).toBe(6)
  expect(readSudokuProgress(board)?.game.notes[0]).toBe(0)
  await act(async () => cell(2).click()); await click('Enter 5')
  expect(container.querySelectorAll('[aria-selected="true"]')).toHaveLength(1)
  expect(readSudokuProgress(board)?.game.cells[2]).toBe(5)
})

it('extends selection with Shift-arrow and Shift-click, including when the focus is a given', async () => {
  await mount(); await act(async () => cell(0).focus())
  await act(async () => cell(0).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true })))
  await act(async () => cell(2).dispatchEvent(new MouseEvent('click', { shiftKey: true, bubbles: true })))
  await act(async () => cell(1).dispatchEvent(new KeyboardEvent('keydown', { key: '9', bubbles: true })))
  expect(readSudokuProgress(board)?.game.notes.slice(0, 3)).toEqual([256, 0, 256])
  expect(readSudokuProgress(board)?.game.cells.slice(0, 3)).toEqual([0, 1, 0])
  await act(async () => cell(2).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })))
  expect(container.querySelectorAll('[aria-selected="true"]')).toHaveLength(1)
})

it('ends a cancelled drag before later pointer movement can extend the selection', async () => {
  await mount(); pointerEnvironment()
  await pointer('pointerdown', 0); await pointer('pointermove', 2)
  await pointer('pointercancel', 2); await pointer('pointermove', 3)
  expect(container.querySelectorAll('[aria-selected="true"]')).toHaveLength(2)
  await pointer('pointerdown', 4); await pointer('pointermove', 5, 'mouse', 2)
  await act(async () => container.querySelector('[role="grid"]')!.dispatchEvent(Object.assign(new Event('lostpointercapture', { bubbles: true }), { pointerId: 1 })))
  await pointer('pointermove', 6)
  expect(container.querySelectorAll('[aria-selected="true"]')).toHaveLength(1)
  expect(readSudokuProgress(board)).toBeNull()
})

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
  storeSudokuProgress(board, { cells: [...board.givens], notes }, { elapsedMs: 0 }, 0)
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
  storeSudokuProgress(hard, { cells: playtest.cells.flat(), notes: playtest.notes.flat().map(text => [...text].reduce((mask, digit) => mask | (1 << (Number(digit) - 1)), 0)) }, { elapsedMs: 0 }, 0)
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

it('dims a digit at nine placements, excluding notes, and restores it after edits or history', async () => {
  const digit = 6, cells = [...board.givens], notes = Array<number>(81).fill(0)
  for (const [i, value] of proof.samples[0]!.solution.entries()) if (value === digit && i !== index) cells[i] = digit
  notes[index] = 1 << (digit - 1)
  storeSudokuProgress(board, { cells, notes }, { elapsedMs: 0 }, 0)
  await mount()
  const picker = () => container.querySelector<HTMLButtonElement>('[aria-label="Enter 6"]')!
  expect(picker().dataset['allPlaced']).toBe('false')
  await click('Enter 6')
  expect(picker().dataset['allPlaced']).toBe('true')
  expect(picker().getAttribute('aria-description')).toBe('9 of 9 placed')
  expect(picker().disabled).toBe(false)
  await click('Undo'); expect(picker().dataset['allPlaced']).toBe('false')
  await click('Redo'); expect(picker().dataset['allPlaced']).toBe('true')
  await click('Erase'); expect(picker().dataset['allPlaced']).toBe('false')
  await click('Undo')
  await act(async () => root.unmount()); root = createRoot(container); await mount()
  expect(picker().dataset['allPlaced']).toBe('true')
  await act(async () => cell(2).click()); await click('Enter 6')
  expect(picker().getAttribute('aria-description')).toBe('10 of 9 placed')
  expect(picker().disabled).toBe(false)
})

it('records a daily first solve, shares the exact level and preserves preview progress and replay result', async () => {
  const daily = { ...board, id: '2026-10-21-sudoku-easy' }
  const puzzle = { id: daily.id, puzzleType: 'sudoku', seed: 123, generatorVersion: 1, board: daily, difficulty: null } as unknown as Puzzle
  const cells = [...proof.samples[0]!.solution]; cells[index] = 0
  const game = { cells, notes: Array<number>(81).fill(0) }
  storeSudokuProgress(board, game, { elapsedMs: 9000 }, 1)
  storeSudokuProgress(daily, game, { elapsedMs: 12000 }, 2, true)
  const previewSave = localStorage.getItem(`daily-puzzles.sudoku-preview.v1.${board.id}`)
  const offerSolve = vi.fn()
  const leaderboard = { ...createLeaderboardStore(null, null, null), offerSolve }
  const renderDaily = () => root.render(<MemoryRouter><LeaderboardContext.Provider value={leaderboard}><SudokuStage board={daily} puzzle={puzzle} /></LeaderboardContext.Provider></MemoryRouter>)
  await act(async () => renderDaily())
  await click(`Enter ${proof.samples[0]!.solution[index]}`)
  expect(container.textContent).toContain('Solved — nice!')
  expect(readSudokuProgress(daily, true)).toBeNull()
  expect(localStorage.getItem(`daily-puzzles.sudoku-preview.v1.${board.id}`)).toBe(previewSave)
  const first = readStoredStats()[0]!
  expect(first).toMatchObject({ id: daily.id, puzzleType: 'sudoku', size: 9, hints: 2 })
  expect(first.elapsedMs).toBeGreaterThanOrEqual(12000)
  expect(offerSolve).toHaveBeenCalledExactlyOnceWith(first)
  await click('Copy result')
  expect(container.querySelector<HTMLTextAreaElement>('.share-text')?.value).toContain('Sudoku Easy 9×9')
  expect(container.querySelector<HTMLTextAreaElement>('.share-text')?.value).toContain(`/#/archive/${daily.id}`)
  await click('Copy with solution')
  expect(container.querySelector<HTMLTextAreaElement>('.share-text')?.value).toContain(proof.samples[0]!.solution.slice(0, 9).join(' '))
  await act(async () => root.unmount()); root = createRoot(container)
  storeSudokuProgress(daily, game, { elapsedMs: 1000 }, 0, true)
  await act(async () => renderDaily())
  await click(`Enter ${proof.samples[0]!.solution[index]}`)
  expect(container.textContent).toContain('your first solve')
  expect(readStoredStats()).toEqual([first])
  expect(offerSolve).toHaveBeenCalledTimes(1)
  await click('Copy result')
  expect(container.querySelector<HTMLTextAreaElement>('.share-text')?.value).toContain('2 hints')
})
