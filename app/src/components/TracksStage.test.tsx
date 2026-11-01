import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { TrackGrid } from '../domain/tracks'
import { createTracksGame, CROSS, type TracksGame } from '../domain/tracksGame'
import type { Puzzle } from '../domain/puzzle'
import { readTrackProgress, storeTrackProgress } from '../lib/trackProgress'
import { readStoredStats } from '../lib/stats'
import { copyText } from '../lib/share'
import { TracksStage } from './TracksStage'
import { TracksBoard } from './TracksBoard'
import { HintPanel } from './HintPanel'

const publication = vi.hoisted(() => ({ offerSolve: vi.fn() }))
vi.mock('../lib/useLeaderboard', () => ({ useLeaderboard: () => ({ offerSolve: publication.offerSolve }) }))

// Real stage handlers and game rules; persistent hook state avoids a DOM dependency.
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
  useEffectEvent: (fn: unknown) => fn,
  useCallback: (fn: unknown) => fn, useEffect: () => {}, useMemo: (fn: () => unknown) => fn(), useId: () => 'hint-id',
}))
function children(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(children)
  if (!isValidElement<Record<string, unknown>>(node)) return []
  return [node, ...children(node.props['children'] as ReactNode)]
}

vi.mock('../lib/share', async (original) => ({ ...await original<typeof import('../lib/share')>(),
  copyText: vi.fn(async () => true), puzzleShareLink: (id: string) => `https://example.test/#/archive/${id}` }))
function playing(grid: TrackGrid, savedHints = 0) {
  vi.stubGlobal('document', { hidden: false, hasFocus: () => true })
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) })
  const puzzle: Puzzle = { id: '2026-10-19-tracks-small', puzzleType: 'train-tracks', seed: 1, generatorVersion: 1, board: grid, difficulty: null }
  storeTrackProgress(puzzle.id, createTracksGame(grid), { elapsedMs: 5000 }, savedHints)
  const render = () => { hooks.cursor = 0; return children(TracksStage({ puzzle, grid, timeZone: 'UTC' })) }
  const board = () => render().find((el) => el.type === TracksBoard)!.props
  const panel = () => render().find((el) => el.type === HintPanel)
  const click = (name: string) => { (render().find((el) => el.type === 'button' && el.props['children'] === name)!.props['onClick'] as () => void)() }
  return { board, panel, click, render, id: puzzle.id }
}
afterEach(() => { hooks.values = []; hooks.cursor = 0; vi.unstubAllGlobals(); vi.clearAllMocks() })

it('explains before editing, applies one undoable move, and persists shown hints', () => {
  const grid = new TrackGrid(3, 3, [0, 3, 0], [1, 1, 1], [0, 0, 0, 1, 0, 1, 0, 0, 0])
  const { board, panel, click, id } = playing(grid)
  click('Hint')
  expect(panel()).toBeDefined()
  expect(panel()!.props['reasons']).toHaveLength(1)
  expect((panel()!.props['supportingReasons'] as string[]).length).toBeGreaterThan(0)
  expect((board()['game'] as TracksGame).pieces[0]).toBe(0)
  expect(readTrackProgress(id, grid)?.hints).toBe(1)
  ;(panel()!.props['onApply'] as () => void)()
  expect((board()['game'] as TracksGame).pieces[0]).toBe(CROSS)
  expect(panel()).toBeUndefined()
  click('Undo')
  expect((board()['game'] as TracksGame).pieces[0]).toBe(0)
  click('Redo')
  expect((board()['game'] as TracksGame).pieces[0]).toBe(CROSS)
  expect(readTrackProgress(id, grid)?.hints).toBe(1)
  click('Hint')
  ;(board()['onGestureStart'] as () => void)()
  expect(panel()).toBeUndefined()
})

it('counts restored hints when Apply finishes a puzzle and when sharing the first result', async () => {
  const grid = new TrackGrid(3, 1, [3], [1, 1, 1], [1, 0, 1])
  const { board, panel, click, render, id } = playing(grid, 2)
  click('Hint')
  expect(panel()).toBeDefined()
  ;(panel()!.props['onApply'] as () => void)()
  expect(board()['locked']).toBe(true)
  expect(readStoredStats()).toMatchObject([{ id, hints: 3 }])
  expect(readTrackProgress(id, grid)).toBeNull()
  expect(publication.offerSolve).toHaveBeenCalledExactlyOnceWith(readStoredStats()[0])
  const solved = render().find((el) => typeof el.type === 'function' && el.type.name === 'SolvedPanel')!
  await (solved.props['onShare'] as (variant: string) => Promise<void>)('result')
  expect(copyText).toHaveBeenLastCalledWith(expect.stringContaining('3 hints'))
})
