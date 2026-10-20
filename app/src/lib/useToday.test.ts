import { afterEach, expect, it, vi } from 'vitest'
import { useToday } from './useToday'

const hooks = vi.hoisted(() => ({
  values: [] as unknown[],
  cursor: 0,
  pending: [] as Array<() => void | (() => void)>,
}))
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => {
    const index = hooks.cursor++
    if (!(index in hooks.values)) hooks.values[index] = typeof initial === 'function' ? initial() : initial
    return [hooks.values[index], (value: unknown) => {
      hooks.values[index] = typeof value === 'function' ? value(hooks.values[index]) : value
    }]
  },
  useEffect: (callback: () => void | (() => void)) => { hooks.pending.push(callback) },
}))

let listeners = new Map<string, () => void>()
function browser() {
  listeners = new Map()
  vi.stubGlobal('document', {
    addEventListener: (name: string, listener: () => void) => listeners.set(name, listener),
    removeEventListener: (name: string) => listeners.delete(name),
  })
  vi.stubGlobal('window', {
    addEventListener: (name: string, listener: () => void) => listeners.set(name, listener),
    removeEventListener: (name: string) => listeners.delete(name),
  })
}

function UseTodayHarness({ timeZone }: { timeZone: string }) {
  return useToday(timeZone)
}

function render(timeZone: string) {
  hooks.cursor = 0
  const today = UseTodayHarness({ timeZone })
  const cleanups = hooks.pending.splice(0).map((effect) => effect())
  return {
    today,
    state: () => hooks.values[0] as string,
    cleanup: () => { for (const cleanup of cleanups) cleanup?.() },
  }
}

afterEach(() => {
  hooks.values = []
  hooks.cursor = 0
  hooks.pending = []
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

it('rolls over at local midnight and keeps the next timer armed', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 20, 12, 0, 0))
  browser()
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const { today, state, cleanup } = render(zone)
  expect(today).toBe('2026-10-20')
  const now = new Date()
  const midnight = new Date(now)
  midnight.setHours(24, 0, 0, 0)
  vi.advanceTimersByTime(midnight.getTime() - now.getTime() + 1)
  expect(state()).toBe('2026-10-21')
  expect(vi.getTimerCount()).toBe(1)
  cleanup()
  expect(vi.getTimerCount()).toBe(0)
  expect(listeners.size).toBe(0)
})

it('rereads the day when a throttled tab becomes visible or focused', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 20, 12, 0, 0))
  browser()
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const { state, cleanup } = render(zone)
  vi.setSystemTime(new Date(2026, 9, 21, 9, 0, 0))
  listeners.get('visibilitychange')!()
  expect(state()).toBe('2026-10-21')
  vi.setSystemTime(new Date(2026, 9, 22, 9, 0, 0))
  listeners.get('focus')!()
  expect(state()).toBe('2026-10-22')
  vi.setSystemTime(new Date(2026, 9, 23, 9, 0, 0))
  listeners.get('pageshow')!()
  expect(state()).toBe('2026-10-23')
  cleanup()
})
