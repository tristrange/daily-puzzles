// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import queen from '@shared/conformance/hint-cases/2026-05-11.puzzle.json'
import star from '@shared/conformance/hint-cases/2026-09-26-star.puzzle.json'
import type { Board } from '../domain/board'
import type { GameState } from '../domain/game'
import { marksBoard } from '../domain/helpers'
import { parsePuzzle, type Puzzle } from '../domain/puzzle'
import { readMarksProgress, storeMarksProgress } from '../lib/marksProgress'
import { PuzzleStage } from './PuzzleView'

const queenPuzzle = parsePuzzle(queen)
const starPuzzle = parsePuzzle(star)
const queenBoard = marksBoard(queenPuzzle)
const starBoard = marksBoard(starPuzzle)

let container: HTMLDivElement, root: Root
beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  HTMLElement.prototype.scrollIntoView = vi.fn()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  localStorage.clear()
  sessionStorage.clear()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function mount(puzzle: Puzzle, board: Board, game?: Pick<GameState, 'queens' | 'marks'>, hints = 0) {
  if (game) storeMarksProgress(puzzle.id, { board, ...game }, { elapsedMs: 0 }, hints)
  await act(async () => root.render(<PuzzleStage puzzle={puzzle} board={board} timeZone="UTC" />))
}

async function click(name: string) {
  const button = [...container.querySelectorAll<HTMLButtonElement>('button')]
    .find(element => element.textContent?.trim() === name || element.getAttribute('aria-label') === name)
  if (!button) throw Error(`Missing button: ${name}`)
  await act(async () => button.click())
}

async function key(name: string, extra: KeyboardEventInit = {}) {
  const board = container.querySelector<HTMLElement>('.board')
  if (!board) throw Error('Missing board')
  await act(async () => board.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, ...extra })))
}

const message = () => container.querySelector('.marks-check-result p')?.textContent ?? null
const resultHidden = () => container.querySelector('.marks-check-result')?.classList.contains('sr-only') ?? true
const target = () => container.querySelector('[data-hint="target"]')

it.each([
  { name: 'Queens', puzzle: queenPuzzle, board: queenBoard, pieces: [3, 5, 12] },
  { name: 'Star Battle', puzzle: starPuzzle, board: starBoard, pieces: [1, 13] },
])('$name checks correct pieces and crosses without revealing or counting a hint', async ({ puzzle, board, pieces }) => {
  await mount(puzzle, board, { queens: new Set(pieces), marks: new Set([0]) })
  const before = readMarksProgress(puzzle.id, board)!.game
  await click('Check progress')
  expect(message()).toContain('crosses agree with the verified unique solution')
  expect(resultHidden()).toBe(false)
  expect(target()).toBeNull()
  expect(container.querySelector('.hint-panel')).toBeNull()
  expect(readMarksProgress(puzzle.id, board)?.hints).toBe(0)
  expect(readMarksProgress(puzzle.id, board)!.game).toEqual(before)
})

it.each([
  { name: 'Queens', puzzle: queenPuzzle, board: queenBoard, piece: 'queen', title: 'Remove this queen' },
  { name: 'Star Battle', puzzle: starPuzzle, board: starBoard, piece: 'star', title: 'Remove this star' },
])('$name offers the checked wrong piece as a counted correction', async ({ puzzle, board, piece, title }) => {
  await mount(puzzle, board, { queens: new Set([0]), marks: new Set() })
  await click('Check progress')
  expect(message()).toContain(`At least one ${piece} or cross disagrees`)
  expect(target()).toBeNull()
  expect(readMarksProgress(puzzle.id, board)?.hints).toBe(0)

  await click('Show the mistake')
  expect(target()?.getAttribute('data-cell')).toBe('0')
  expect(container.querySelector('.hint-panel h2')?.textContent).toBe(title)
  expect(readMarksProgress(puzzle.id, board)?.hints).toBe(1)

  await click('Apply move')
  expect(readMarksProgress(puzzle.id, board)?.game.queens).toEqual(new Set())
  await click('Undo')
  expect(readMarksProgress(puzzle.id, board)?.game.queens).toEqual(new Set([0]))
  expect(readMarksProgress(puzzle.id, board)?.hints).toBe(1)
})

it('offers a wrong cross as a counted correction and returns focus to Check', async () => {
  await mount(queenPuzzle, queenBoard, { queens: new Set([3, 5, 12]), marks: new Set([0, 19]) })
  await click('Check progress')
  expect(message()).toContain('At least one queen or cross disagrees')
  expect(readMarksProgress(queenPuzzle.id, queenBoard)?.hints).toBe(0)

  await click('Show the mistake')
  expect(target()?.getAttribute('data-cell')).toBe('19')
  expect(container.querySelector('.hint-panel h2')?.textContent).toBe('Clear this cross')
  expect(readMarksProgress(queenPuzzle.id, queenBoard)?.hints).toBe(1)

  await click('Dismiss hint')
  expect(document.activeElement?.getAttribute('aria-label')).toBe('Check progress')
  expect(readMarksProgress(queenPuzzle.id, queenBoard)?.game.marks).toEqual(new Set([0, 19]))
})

it('does not call an unverified or non-unique board correct', async () => {
  const raw = { ...queen, board: { size: 4, regions: Array.from({ length: 16 }, (_, i) => Math.floor(i / 4)) } }
  const puzzle = parsePuzzle(raw)
  const board = marksBoard(puzzle)
  await mount(puzzle, board, { queens: new Set([0]), marks: new Set() })
  await click('Check progress')
  expect(message()).toContain('could not verify a unique solution')
  expect(message()).not.toContain('agree with')
  expect(readMarksProgress(puzzle.id, board)?.hints).toBe(0)
})

it('clears a check result after an edit, undo, redo and reset', async () => {
  await mount(queenPuzzle, queenBoard, { queens: new Set([3, 5, 12]), marks: new Set([0]) })
  const correct = 'crosses agree with the verified unique solution'

  await click('Check progress')
  expect(message()).toContain(correct)
  await key('x')
  expect(resultHidden()).toBe(true)
  expect(message()).toBe('')

  await click('Check progress')
  expect(message()).toContain(correct)
  await key('z', { ctrlKey: true })
  expect(resultHidden()).toBe(true)

  await click('Check progress')
  expect(message()).toContain(correct)
  await key('z', { ctrlKey: true, shiftKey: true })
  expect(resultHidden()).toBe(true)

  await click('Check progress')
  expect(message()).toContain(correct)
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  await click('Reset')
  expect(resultHidden()).toBe(true)
  expect(message()).toBe('')
})
