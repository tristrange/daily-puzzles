import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import pilot from '@shared/docs/measurements/trio-pilot.json'
import raw from '../data/trio-previews.json'
import { TrioGrid, parseTrioBoard, type TrioBoard as Board, type TrioValue } from '../domain/trio'
import type { Puzzle } from '../domain/puzzle'
import { readTrioProgress, storeTrioProgress } from '../lib/trioProgress'
import { readStoredStats, STATS_STORAGE_KEY } from '../lib/stats'
import { copyText } from '../lib/share'
import { TrioStage } from './TrioStage'
import { TrioBoard } from './TrioBoard'
import { TrioHintPanel } from './TrioHintPanel'
import { SolvedPanel } from './SolvedPanel'

// Run real handlers with persistent hook state, without adding a DOM dependency.
const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }))
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
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
  useEffect: () => {}, useCallback: (callback: unknown) => callback, useId: () => 'test-id',
}))
vi.mock('../lib/share', async (original) => ({ ...await original<typeof import('../lib/share')>(),
  copyText: vi.fn(async () => true), puzzleShareLink: (id: string) => `https://example.test/#/archive/${id}` }))

function children(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(children)
  if (!isValidElement<Record<string, unknown>>(node)) return []
  return [node, ...children(node.props['children'] as ReactNode)]
}
function storage() {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) })
  vi.stubGlobal('document', { hidden: false })
  vi.stubGlobal('performance', { now: () => 0 })
  return values
}
const cell = raw[0]!.givens.indexOf(0)
function nearlySolved(board: Board, elapsed: number, daily = false, hints = 0) {
  const cells = [...pilot.samples[0]!.solution] as TrioValue[]
  cells[cell] = 0
  storeTrioProgress(board, { cells, notes: Array<number>(81).fill(0) }, elapsed, daily, hints)
}
function finish(playing: ReactElement<Record<string, unknown>>) {
  ;(playing.props['onBegin'] as () => void)()
  ;(playing.props['onApply'] as (cell: number, action: { value: number }) => void)(cell, { value: pilot.samples[0]!.solution[cell]! })
  ;(playing.props['onEnd'] as (cancel: boolean) => void)(false)
}
afterEach(() => { hooks.values = []; hooks.cursor = 0; vi.unstubAllGlobals(); vi.clearAllMocks() })

it('persists shown hints, records the first daily solve and shares it on replay', async () => {
  storage()
  const board = new TrioGrid('2026-10-18-trio', raw[0]!.givens, raw[0]!.relations)
  const puzzle: Puzzle = { id: board.id, puzzleType: 'trio', seed: 123, generatorVersion: 1, board, difficulty: null }
  nearlySolved(board, 5000, true, 2)
  const render = () => { hooks.cursor = 0; return children(TrioStage({ board, puzzle })) }
  const hint = render().find((element) => element.props['aria-label'] === 'Get an explained hint')!
  ;(hint.props['onClick'] as () => void)()
  expect(readTrioProgress(board, true)?.hints).toBe(3)
  ;(render().find((element) => element.type === TrioHintPanel)!.props['onApply'] as () => void)()
  finish(render().find((element) => element.type === TrioBoard)!)
  const first = readStoredStats()[0]!
  expect(first).toMatchObject({ id: board.id, puzzleType: 'trio', size: 9, elapsedMs: 5000, hints: 3 })
  expect(readTrioProgress(board, true)).toBeNull()
  expect(render().find((element) => element.type === SolvedPanel)!.props['solved']).toBe(true)
  hooks.values = []
  nearlySolved(board, 9000, true)
  finish(render().find((element) => element.type === TrioBoard)!)
  expect(readStoredStats()).toEqual([first])
  await (render().find((element) => element.type === SolvedPanel)!.props['onShare'] as (variant: string) => Promise<void>)('result')
  expect(copyText).toHaveBeenLastCalledWith(expect.stringContaining('0:05 · 3 hints'))
  expect(copyText).toHaveBeenLastCalledWith(expect.stringContaining(`/#/archive/${board.id}`))
  await (render().find((element) => element.type === SolvedPanel)!.props['onShare'] as (variant: string) => Promise<void>)('solution')
  expect(copyText).toHaveBeenLastCalledWith(expect.stringContaining('☀'))
})

it('leaves daily stats untouched when completing a preview', () => {
  const values = storage()
  values.set(STATS_STORAGE_KEY, 'existing daily history')
  const board = parseTrioBoard(raw[0])
  nearlySolved(board, 123)
  const render = () => { hooks.cursor = 0; return children(TrioStage({ board })) }
  for (let i = 0; i < 2; i++) {
    ;(render().find((element) => element.props['aria-label'] === 'Get an explained hint')!.props['onClick'] as () => void)()
    ;(render().find((element) => element.type === TrioHintPanel)!.props['onApply'] as () => void)()
  }
  expect(render().find((element) => element.type === TrioBoard)!.props['locked']).toBe(true)
  expect(render().find((element) => element.props['role'] === 'status')!.props['children']).toContain('Solved in')
  expect(values.get(STATS_STORAGE_KEY)).toBe('existing daily history')
  expect(readTrioProgress(board)).toBeNull()
})
