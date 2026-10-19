import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { WordGrid } from '../domain/wordPaths'
import { createWordGame, submitWord, type WordGame } from '../domain/wordGame'
import type { Puzzle } from '../domain/puzzle'
import { readWordProgress, storeWordProgress } from '../lib/wordProgress'
import { readStoredStats } from '../lib/stats'
import { copyText } from '../lib/share'
import { WordPathsStage } from './WordPathsStage'
import { WordPathsBoard } from './WordPathsBoard'
import { HintPanel } from './HintPanel'

// Same persistent-hook harness as TracksStage: real rules, storage and handlers, no DOM dependency.
const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }))
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
  useCallback: (fn: unknown) => fn, useEffect: () => {}, useMemo: (fn: () => unknown) => fn(), useId: () => 'hint-id',
}))
vi.mock('../lib/share', async (original) => ({ ...await original<typeof import('../lib/share')>(),
  copyText: vi.fn(async () => true), puzzleShareLink: (id: string) => `https://example.test/#/archive/${id}` }))
function children(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(children)
  if (!isValidElement<Record<string, unknown>>(node)) return []
  return [node, ...children(node.props['children'] as ReactNode)]
}
const grid = new WordGrid(4, 2, ['C', 'A', 'T', null, 'L', 'I', 'O', 'N'], [3, 4], 2)
function playing(game = createWordGame(grid), hints = 0) {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) })
  vi.stubGlobal('document', { hidden: false })
  const puzzle: Puzzle = { id: '2026-10-19-words', puzzleType: 'word-paths', seed: 1, generatorVersion: 2, board: grid, difficulty: null }
  storeWordProgress(puzzle.id, game, 5000, false, hints)
  const render = () => { hooks.cursor = 0; return children(WordPathsStage({ puzzle, grid, timeZone: 'UTC' })) }
  const board = () => render().find((el) => el.type === WordPathsBoard)!.props
  const panel = () => render().find((el) => el.type === HintPanel)
  const click = (name: string) => { (render().find((el) => el.type === 'button' && el.props['children'] === name)!.props['onClick'] as () => void)() }
  return { board, panel, click, render, id: puzzle.id }
}
afterEach(() => { hooks.values = []; hooks.cursor = 0; vi.unstubAllGlobals(); vi.clearAllMocks() })

it('reveals one letter at a time without editing the trace, and clears stale hints on Undo/Redo', () => {
  const { board, panel, click, id } = playing({ ...createWordGame(grid), trace: [4] }, 2)
  click('Hint')
  expect(board()['hintPath']).toEqual([0])
  expect((board()['game'] as WordGame).trace).toEqual([4])
  expect(readWordProgress(id, grid)?.hints).toBe(3)
  ;(panel()!.props['onApply'] as () => void)()
  expect(board()['hintPath']).toEqual([0, 1])
  expect(readWordProgress(id, grid)?.hints).toBe(4)
  ;(panel()!.props['onApply'] as () => void)()
  expect(board()['hintPath']).toEqual([0, 1, 2])
  expect(panel()!.props['onApply']).toBeUndefined()
  ;(board()['onRestoreTrace'] as (path: number[]) => void)([0, 1, 2])
  ;(board()['onSubmit'] as () => void)()
  expect(panel()).toBeUndefined()
  click('Hint')
  expect(board()['hintPath']).toEqual([4])
  click('Undo')
  expect(panel()).toBeUndefined()
  click('Redo')
  expect(panel()).toBeUndefined()
  expect(readWordProgress(id, grid)?.hints).toBe(6)
})

it('counts restored and newly revealed letters in the solved result and share', async () => {
  const game = submitWord({ ...createWordGame(grid), trace: [0, 1, 2] }).game
  const { board, click, render, id } = playing(game, 3)
  click('Hint')
  ;(board()['onRestoreTrace'] as (path: number[]) => void)([4, 5, 6, 7])
  ;(board()['onSubmit'] as () => void)()
  expect(board()['locked']).toBe(true)
  expect(readStoredStats()).toMatchObject([{ id, hints: 4 }])
  expect(readWordProgress(id, grid)).toBeNull()
  const solved = render().find((el) => typeof el.type === 'function' && el.type.name === 'SolvedPanel')!
  await (solved.props['onShare'] as (variant: string) => Promise<void>)('result')
  expect(copyText).toHaveBeenLastCalledWith(expect.stringContaining('4 hints'))
})

it('explains a dead end without charging a hint or changing the accepted word', () => {
  const game = submitWord({ ...createWordGame(grid), trace: [1, 5, 4] }).game
  const { board, panel, click, render, id } = playing(game, 2)
  click('Hint')
  expect(panel()).toBeUndefined()
  expect((board()['game'] as WordGame).words).toEqual([[1, 5, 4]])
  expect(readWordProgress(id, grid)?.hints).toBe(2)
  expect(render().some((el) => el.props['role'] === 'status'
    && String(el.props['children']).includes('Use Undo'))).toBe(true)
})
