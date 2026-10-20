import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { readLeaderboard } from '../lib/leaderboard'
import { LeaderboardPanel, LeaderboardTable } from './LeaderboardPanel'
import { JoinLeaderboard } from './JoinLeaderboard'

const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, effects: [] as (() => void)[] }))
const session = vi.hoisted(() => ({ client: {}, config: { siteKey: '0xexample' }, status: 'off', nickname: '', pendingCount: 0,
  message: '', resultsRevision: 0, resultsPuzzleId: null, join: vi.fn(async () => {}), stop: vi.fn(), retry: vi.fn(async () => {}), removeResults: vi.fn(async () => {}) }))
vi.mock('../lib/useLeaderboard', () => ({ useLeaderboard: () => session }))
vi.mock('../lib/leaderboard', async original => ({ ...await original<typeof import('../lib/leaderboard')>(), readLeaderboard: vi.fn() }))
vi.mock('react', async original => ({ ...await original<typeof import('react')>(),
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
  useId: () => 'input-id',
  useEffect: (callback: () => void | (() => void), deps: unknown[]) => {
    const index = hooks.cursor++, held = hooks.values[index] as { deps: unknown[]; cleanup?: () => void } | undefined
    if (held && held.deps.length === deps.length && held.deps.every((value, i) => value === deps[i])) return
    held?.cleanup?.()
    const effect: { deps: unknown[]; cleanup?: () => void } = { deps }
    hooks.values[index] = effect
    hooks.effects.push(() => { const cleanup = callback(); if (cleanup) effect.cleanup = cleanup })
  },
}))
function children(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(children)
  if (!isValidElement<Record<string, unknown>>(node)) return []
  return [node, ...children(node.props['children'] as ReactNode)]
}
function render(id = '2026-10-19') {
  if (typeof window === 'undefined') vi.stubGlobal('window', new EventTarget())
  if (typeof navigator === 'undefined' || !('onLine' in navigator)) vi.stubGlobal('navigator', { onLine: true })
  hooks.cursor = 0
  const elements = children(LeaderboardPanel({ puzzleId: id }))
  hooks.effects.splice(0).forEach(effect => effect())
  return elements
}
const row = { entries: [{ rank: 1, nickname: 'Alice', elapsed_ms: 1000, hints: 0, is_you: false }], total: 1, own_entry: null }
afterEach(() => {
  hooks.values.forEach(value => (value as { cleanup?: () => void } | null)?.cleanup?.())
  hooks.values = []; hooks.effects = []; hooks.cursor = 0
  session.status = 'off'; session.nickname = ''; session.message = ''
  vi.unstubAllGlobals(); vi.clearAllMocks()
})

it('ignores late responses for a previous puzzle and distinguishes loading, empty and failure', async () => {
  let finishOld!: (board: typeof row) => void
  vi.mocked(readLeaderboard).mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve })).mockResolvedValueOnce({ entries: [], total: 0, own_entry: null })
  expect(render().some(el => el.props['children'] === 'Loading leaderboard…')).toBe(true)
  render('2026-10-18'); await Promise.resolve()
  finishOld(row); await Promise.resolve()
  const table = render('2026-10-18').find(el => el.type === LeaderboardTable)!
  expect(table.props['board']).toEqual({ entries: [], total: 0, own_entry: null })
  vi.mocked(readLeaderboard).mockRejectedValueOnce(Error('This leaderboard is not available yet.'))
  render('2026-10-17'); await Promise.resolve()
  expect(render('2026-10-17').some(el => el.props['children'] === 'This leaderboard is not available yet.')).toBe(true)
})

it('requires explicit removal confirmation and never claims a failed deletion succeeded', async () => {
  vi.mocked(readLeaderboard).mockResolvedValue(row)
  session.status = 'on'; session.nickname = 'Alice'
  const click = async (name: string) => { const button = render().find(el => el.type === 'button' && el.props['children'] === name)!; await (button.props['onClick'] as () => unknown)() }
  await click('Remove my published results')
  expect(session.removeResults).not.toHaveBeenCalled()
  await click('Keep results')
  expect(session.removeResults).not.toHaveBeenCalled()
  session.removeResults.mockRejectedValueOnce(Error('unavailable'))
  await click('Remove my published results'); await click('Yes, remove my results')
  expect(render().some(el => el.type === 'button' && el.props['children'] === 'Keep results')).toBe(true)
})

it('does not enable joining without consent, a valid nickname and verification', async () => {
  const closed = vi.fn()
  const form = () => { hooks.cursor = 0; return children(JoinLeaderboard({ onClose: closed })) }
  const submit = async () => { const root = form().find(el => el.type === 'form')!; await (root.props['onSubmit'] as (event: { preventDefault: () => void }) => Promise<void>)({ preventDefault: () => {} }) }
  await submit()
  expect(session.join).not.toHaveBeenCalled()
  ;(form().find(el => el.type === 'input' && el.props['name'] === 'nickname')!.props['onChange'] as (event: unknown) => void)({ target: { value: 'Alice' } })
  ;(form().find(el => el.type === 'input' && el.props['type'] === 'checkbox')!.props['onChange'] as (event: unknown) => void)({ target: { checked: true } })
  await submit()
  expect(session.join).not.toHaveBeenCalled()
  expect(closed).not.toHaveBeenCalled()
})
