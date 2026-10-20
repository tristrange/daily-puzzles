import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import queen from '@shared/conformance/hint-cases/2026-05-11.puzzle.json'
import star from '@shared/conformance/hint-cases/2026-10-08-star.puzzle.json'
import type { Board } from '../domain/board'
import { parsePuzzle, type Puzzle } from '../domain/puzzle'
import { marksBoard } from '../domain/helpers'
import { readStoredStats } from '../lib/stats'
import { clearMarksProgress, readMarksProgress, storeMarksProgress } from '../lib/marksProgress'
import { PuzzleStage } from './PuzzleView'
import { InteractiveBoard } from './InteractiveBoard'

const publication = vi.hoisted(() => ({ offerSolve: vi.fn() }))
vi.mock('../lib/useLeaderboard', () => ({ useLeaderboard: () => ({ offerSolve: publication.offerSolve }) }))

// Real stage handlers and game rules; persistent hook state avoids a DOM dependency.
const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }))
const effects = vi.hoisted(() => ({ pending: [] as Array<() => void | (() => void)> }))
vi.mock('react', async (original) => ({ ...await original<typeof import('react')>(),
  useState: (initial: unknown) => {
    const index = hooks.cursor++
    if (!(index in hooks.values)) hooks.values[index] = typeof initial === 'function' ? initial() : initial
    return [hooks.values[index], (value: unknown) => { hooks.values[index] = typeof value === 'function' ? value(hooks.values[index]) : value }]
  },
  useRef: (current: unknown) => {
    const index = hooks.cursor++
    if (!(index in hooks.values)) hooks.values[index] = { current }
    return hooks.values[index]
  },
  useEffect: (callback: () => void | (() => void)) => { effects.pending.push(callback) },
  useMemo: (fn: () => unknown) => fn(), useId: () => 'hint-id',
}))
function children(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(children)
  if (!isValidElement<Record<string, unknown>>(node)) return []
  return [node, ...children(node.props['children'] as ReactNode)]
}
function playing(raw: unknown, seed?: (puzzle: Puzzle, board: Board) => void) {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) })
  const puzzle = parsePuzzle(raw)
  const board = marksBoard(puzzle)
  seed?.(puzzle, board)
  const render = () => { hooks.cursor = 0; return children(PuzzleStage({ puzzle, board, timeZone: 'UTC' })) }
  return {
    board: () => render().find((element) => element.type === InteractiveBoard)!.props,
    click: (name: string) => { (render().find((element) => element.type === 'button' && element.props['children'] === name)!.props['onClick'] as () => void)() },
    panel: () => render().find((element) => typeof element.type === 'function' && element.type.name === 'HintPanel'),
    render,
    puzzle,
    markBoard: board,
  }
}
afterEach(() => {
  hooks.values = []; hooks.cursor = 0; effects.pending = []
  vi.unstubAllGlobals(); vi.clearAllMocks()
})

it.each([['Queens', queen, 'queens', 5], ['Star Battle', star, 'marks', 0]] as const)(
  '%s shows the deduction before applying one undoable move', (_, raw, kind, target) => {
    const { board, click, panel } = playing(raw)
    click('Hint')
    expect(panel()).toBeDefined()
    expect((board()['game'] as { queens: Set<number>; marks: Set<number> })[kind].size).toBe(0)
    ;(panel()!.props['onApply'] as () => void)()
    expect((board()['game'] as { queens: Set<number>; marks: Set<number> })[kind]).toEqual(new Set([target]))
    expect(panel()).toBeUndefined()
    click('Undo')
    expect((board()['game'] as { queens: Set<number>; marks: Set<number> })[kind].size).toBe(0)
    click('Redo')
    expect((board()['game'] as { queens: Set<number>; marks: Set<number> })[kind]).toEqual(new Set([target]))
    click('Hint')
    ;(board()['onGestureStart'] as () => void)()
    expect(panel()).toBeUndefined()
  },
)

it('restores an unfinished attempt with its board, hints and elapsed time', () => {
  const { board, render, puzzle, markBoard } = playing(queen, (puzzle, board) => {
    storeMarksProgress(puzzle.id, {
      board,
      queens: new Set([3, 5, 12, 19]),
      marks: new Set([8]),
    }, 1234, 2)
  })
  const game = board()['game'] as { queens: Set<number>; marks: Set<number> }
  expect(game.queens).toEqual(new Set([3, 5, 12, 19]))
  expect(game.marks).toEqual(new Set([8]))
  expect(render().find((element) => element.props['role'] === 'timer')!.props['children']).toBe('0:01')
  ;(board()['onToggleQueen'] as (cell: number) => void)(21)
  expect(board()['locked']).toBe(true)
  expect(readStoredStats()).toMatchObject([{ id: puzzle.id, hints: 2 }])
  expect(readMarksProgress(puzzle.id, markBoard)).toBeNull()
})

it('flushes the current board when the page is hidden', () => {
  const listeners = new Map<string, () => void>()
  vi.stubGlobal('document', {
    addEventListener: (name: string, listener: () => void) => listeners.set(name, listener),
    removeEventListener: () => {},
  })
  vi.stubGlobal('window', {
    addEventListener: (name: string, listener: () => void) => listeners.set(name, listener),
    removeEventListener: () => {},
  })
  vi.stubGlobal('setInterval', () => 1)
  vi.stubGlobal('clearInterval', () => {})
  const { board, puzzle, markBoard } = playing(queen)
  board()
  effects.pending.at(-1)!()
  ;(board()['onToggleQueen'] as (cell: number) => void)(3)
  clearMarksProgress(puzzle.id)
  listeners.get('pagehide')!()
  expect(readMarksProgress(puzzle.id, markBoard)?.game.queens).toEqual(new Set([3]))
})

it('records a solve and its shown hint when Apply move fills the last cell', () => {
  const { board, click, panel } = playing(queen)
  for (const cell of [3, 5, 12, 19]) (board()['onToggleQueen'] as (cell: number) => void)(cell)
  click('Hint')
  expect(panel()).toBeDefined()
  ;(panel()!.props['onApply'] as () => void)()
  expect(board()['locked']).toBe(true)
  expect(readStoredStats()).toMatchObject([{ id: '2026-05-11', hints: 1 }])
  expect(publication.offerSolve).toHaveBeenCalledExactlyOnceWith(readStoredStats()[0])
})

it('hands off the Star Battle first result with its actual family and prevents replay uploads', () => {
  const raw = { ...star, board: { size: 9, regions: Array.from({ length: 81 }, (_, i) => Math.floor(i / 9)), regionCapacity: Array(9).fill(2) } }
  const { board } = playing(raw)
  for (const cell of [0, 2, 13, 15, 18, 26, 29, 31, 42, 44, 46, 48, 59, 61, 64, 66, 77, 79]) (board()['onToggleQueen'] as (cell: number) => void)(cell)
  expect(board()['locked']).toBe(true)
  expect(publication.offerSolve).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: '2026-10-08-star', puzzleType: 'star-battle', hints: 0 }))
  hooks.values = []; hooks.cursor = 0
  const puzzle = parsePuzzle(raw)
  const render = () => { hooks.cursor = 0; return children(PuzzleStage({ puzzle, board: marksBoard(puzzle), timeZone: 'UTC' })) }
  for (const cell of [0, 2, 13, 15, 18, 26, 29, 31, 42, 44, 46, 48, 59, 61, 64, 66, 77, 79]) {
    const props = render().find(el => el.type === InteractiveBoard)!.props
    ;(props['onToggleQueen'] as (cell: number) => void)(cell)
  }
  expect(publication.offerSolve).toHaveBeenCalledTimes(1)
})
