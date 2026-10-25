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
import { ResetButton } from './ResetButton'

const publication = vi.hoisted(() => ({ offerSolve: vi.fn() }))
vi.mock('../lib/useLeaderboard', () => ({ useLeaderboard: () => ({ offerSolve: publication.offerSolve }) }))

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
  useEffectEvent: (fn: unknown) => fn,
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
  vi.stubGlobal('document', { hidden: false, hasFocus: () => true })
  vi.stubGlobal('performance', { now: () => 0 })
  return values
}
const cell = raw[0]!.givens.indexOf(0)
function nearlySolved(board: Board, elapsed: number, daily = false, hints = 0) {
  const cells = [...pilot.samples[0]!.solution] as TrioValue[]
  cells[cell] = 0
  storeTrioProgress(board, { cells, notes: Array<number>(81).fill(0) }, { elapsedMs: elapsed }, daily, hints)
}
function finish(playing: ReactElement<Record<string, unknown>>) {
  ;(playing.props['onBegin'] as () => void)()
  ;(playing.props['onApply'] as (cell: number, action: { value: number }) => void)(cell, { value: pilot.samples[0]!.solution[cell]! })
  ;(playing.props['onEnd'] as (cancel: boolean) => void)(false)
}
afterEach(() => { hooks.values = []; hooks.cursor = 0; vi.unstubAllGlobals(); vi.clearAllMocks() })

it.each([false, true])('clears all notes as one saved, undoable move (daily: %s)', (daily) => {
  storage()
  const board = daily ? new TrioGrid('2026-10-20-trio', raw[0]!.givens, raw[0]!.relations) : parseTrioBoard(raw[0])
  const puzzle: Puzzle | undefined = board instanceof TrioGrid ? { id: board.id, puzzleType: 'trio', seed: 123, generatorVersion: 1, board, difficulty: null } : undefined
  const empty = board.givens.flatMap((value, index) => value === 0 ? [index] : [])
  const cells = [...board.givens], notes = Array<number>(81).fill(0)
  cells[empty[0]!] = 3
  notes[empty[1]!] = 1
  notes[empty[2]!] = 7
  storeTrioProgress(board, { cells, notes }, { elapsedMs: 5000 }, daily, 2)
  const render = () => { hooks.cursor = 0; return children(TrioStage({ board, ...(puzzle ? { puzzle } : {}) })) }
  const button = (name: string) => render().find(element => element.type === 'button' && element.props['children'] === name)
  const playing = () => render().find(element => element.type === TrioBoard)!.props
  const game = () => playing()['game'] as { cells: number[]; notes: number[] }
  const click = (name: string) => { expect(button(name)).toBeDefined(); (button(name)!.props['onClick'] as () => void)() }

  expect(button('Clear notes')).toBeDefined()
  expect(button('Clear notes')!.props['disabled']).toBe(false)
  ;(playing()['onBegin'] as () => void)()
  click('Clear notes')
  expect(game().notes).toEqual(notes)
  ;(playing()['onEnd'] as (cancel: boolean) => void)(true)
  click('Clear notes')
  expect(game().notes.every(value => value === 0)).toBe(true)
  expect(game().cells).toEqual(cells)
  expect(readTrioProgress(board, daily)).toMatchObject({ elapsedMs: 5000, game: { cells, notes: Array(81).fill(0) }, ...(daily ? { hints: 2 } : {}) })
  expect(button('Clear notes')!.props['disabled']).toBe(true)
  click('Undo')
  expect(game().notes).toEqual(notes)
  expect(button('Undo')!.props['disabled']).toBe(true)
  expect(readTrioProgress(board, daily)?.game.notes).toEqual(notes)
  click('Redo')
  expect(game().notes.every(value => value === 0)).toBe(true)
  expect(game().cells).toEqual(cells)
})

it('does not disturb redo when there are no notes to clear', () => {
  storage()
  const board = parseTrioBoard(raw[0])
  const render = () => { hooks.cursor = 0; return children(TrioStage({ board })) }
  const button = (name: string) => render().find(element => element.type === 'button' && element.props['children'] === name)!
  const playing = () => render().find(element => element.type === TrioBoard)!.props
  ;(playing()['onBegin'] as () => void)()
  ;(playing()['onApply'] as (cell: number, action: { note: number; enabled: boolean }) => void)(cell, { note: 2, enabled: true })
  ;(playing()['onEnd'] as (cancel: boolean) => void)(false)
  ;(button('Undo').props['onClick'] as () => void)()
  expect(button('Clear notes')).toBeDefined()
  expect(button('Clear notes').props['disabled']).toBe(true)
  ;(button('Clear notes').props['onClick'] as () => void)()
  expect(button('Redo').props['disabled']).toBe(false)
  ;(button('Redo').props['onClick'] as () => void)()
  expect((playing()['game'] as { notes: number[] }).notes[cell]).toBe(2)
})

it('recovers multiple undos and drops redo after a new move', () => {
  storage()
  const board = parseTrioBoard(raw[0])
  const render = () => { hooks.cursor = 0; return children(TrioStage({ board })) }
  const button = (name: string) => render().find((element) => element.type === 'button' && element.props['children'] === name)!
  const playing = () => render().find((element) => element.type === TrioBoard)!
  const edit = (value: number) => {
    const props = playing().props
    ;(props['onBegin'] as () => void)()
    ;(props['onApply'] as (cell: number, action: { value: number }) => void)(cell, { value })
    ;(props['onEnd'] as (cancel: boolean) => void)(false)
  }
  const value = () => (playing().props['game'] as { cells: number[] }).cells[cell]
  expect(button('Redo')).toBeDefined()
  expect(button('Redo').props['disabled']).toBe(true)
  edit(1)
  edit(2)
  ;(button('Undo').props['onClick'] as () => void)()
  ;(button('Undo').props['onClick'] as () => void)()
  expect(value()).toBe(0)
  ;(button('Redo').props['onClick'] as () => void)()
  expect(value()).toBe(1)
  ;(button('Redo').props['onClick'] as () => void)()
  expect(value()).toBe(2)
  ;(button('Undo').props['onClick'] as () => void)()
  edit(3)
  expect(button('Redo').props['disabled']).toBe(true)
  expect(value()).toBe(3)
})

it('preserves redo when Reset is cancelled and can undo and redo a confirmed reset', () => {
  storage()
  const confirm = vi.fn(() => false)
  vi.stubGlobal('window', { confirm })
  const board = parseTrioBoard(raw[0])
  const render = () => { hooks.cursor = 0; return children(TrioStage({ board })) }
  const click = (name: string) => {
    const button = name === 'Reset'
      ? ResetButton(render().find((element) => element.type === ResetButton)!.props as Parameters<typeof ResetButton>[0])
      : render().find((element) => element.type === 'button' && element.props['children'] === name)!
    ;(button.props['onClick'] as () => void)()
  }
  const playing = () => render().find((element) => element.type === TrioBoard)!.props
  const edit = (value: number) => {
    const props = playing()
    ;(props['onBegin'] as () => void)()
    ;(props['onApply'] as (cell: number, action: { value: number }) => void)(cell, { value })
    ;(props['onEnd'] as (cancel: boolean) => void)(false)
  }
  const value = () => (playing()['game'] as { cells: number[] }).cells[cell]
  edit(1)
  edit(2)
  click('Undo')
  click('Reset')
  expect(value()).toBe(1)
  click('Redo')
  expect(value()).toBe(2)
  click('Undo')
  confirm.mockReturnValue(true)
  click('Reset')
  expect(value()).toBe(0)
  click('Undo')
  expect(value()).toBe(1)
  click('Redo')
  expect(value()).toBe(0)
})

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
  expect(publication.offerSolve).toHaveBeenCalledExactlyOnceWith(first)
  expect(readTrioProgress(board, true)).toBeNull()
  expect(render().find((element) => element.type === SolvedPanel)!.props['solved']).toBe(true)
  hooks.values = []
  nearlySolved(board, 9000, true)
  finish(render().find((element) => element.type === TrioBoard)!)
  expect(readStoredStats()).toEqual([first])
  expect(publication.offerSolve).toHaveBeenCalledTimes(1)
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
  expect(render().find((element) => element.type === 'button' && element.props['children'] === 'Clear notes')!.props['disabled']).toBe(true)
  expect(render().find((element) => element.props['role'] === 'status')!.props['children']).toContain('Solved in')
  expect(values.get(STATS_STORAGE_KEY)).toBe('existing daily history')
  expect(publication.offerSolve).not.toHaveBeenCalled()
  expect(readTrioProgress(board)).toBeNull()
})
