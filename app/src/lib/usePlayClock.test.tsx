// @vitest-environment jsdom
import { act, useLayoutEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import type { PlayTime } from './playTime'
import { usePlayClock } from './usePlayClock'

it('settles fractional reset boundaries atomically and freezes every operation after stopping', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  let now = 0
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  const container = document.createElement('div'), root = createRoot(container), save = vi.fn()
  let clock: ReturnType<typeof usePlayClock> | undefined
  function Harness() {
    const value = usePlayClock({ elapsedMs: 0 }, save)
    useLayoutEffect(() => { clock = value })
    return null
  }
  const current = () => { if (!clock) throw Error('Clock not mounted'); return clock }
  try {
    await act(async () => root.render(<Harness />))
    now = .75
    await act(async () => { expect(current().restartAttempt()).toEqual({ elapsedMs: 0, attemptElapsedMs: 0 }) })
    now = 1.25
    expect(current().settle()).toEqual({ elapsedMs: 1, attemptElapsedMs: 0 })
    now = 2.25
    expect(current().settle()).toEqual({ elapsedMs: 2, attemptElapsedMs: 1 })
    now = 2.75
    await act(async () => { expect(current().restartAttempt()).toEqual({ elapsedMs: 2, attemptElapsedMs: 0 }) })
    now = 4.25
    let frozen: PlayTime | undefined
    await act(async () => { frozen = current().stop() })
    expect(frozen).toEqual({ elapsedMs: 4, attemptElapsedMs: 1 })
    expect(current().time).toEqual(frozen)
    now = 100_000
    await act(async () => {
      expect(current().settle()).toEqual(frozen)
      expect(current().restartAttempt()).toEqual(frozen)
      expect(current().stop()).toEqual(frozen)
    })
    expect(current().time).toEqual(frozen)
  } finally {
    await act(async () => root.unmount())
    vi.restoreAllMocks(); vi.unstubAllGlobals()
  }
})

it.each([
  { name: 'iPhone Safari', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', countsUnfocused: true },
  { name: 'desktop Safari', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', countsUnfocused: false },
])('$name resumes and pauses on the appropriate lifecycle signals', async ({ userAgent, countsUnfocused }) => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  let now = 0, hidden = false, focused = true
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent)
  vi.spyOn(navigator, 'platform', 'get').mockReturnValue(userAgent.includes('iPhone') ? 'iPhone' : 'MacIntel')
  vi.spyOn(performance, 'now').mockImplementation(() => now)
  vi.spyOn(document, 'hasFocus').mockImplementation(() => focused)
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden)
  const container = document.createElement('div'), root = createRoot(container)
  let clock: ReturnType<typeof usePlayClock> | undefined
  function Harness() {
    const value = usePlayClock({ elapsedMs: 1000 }, () => {})
    useLayoutEffect(() => { clock = value })
    return null
  }
  const current = () => { if (!clock) throw Error('Clock not mounted'); return clock }
  const tick = async (elapsed: number) => { now += elapsed; await act(async () => vi.advanceTimersByTime(500)) }
  const dispatch = async (target: Window | Document, name: string) => { await act(async () => target.dispatchEvent(new Event(name))) }
  try {
    await act(async () => root.render(<Harness />))
    await tick(1000)
    expect(current().time.elapsedMs).toBe(2000)
    focused = false; await dispatch(window, 'blur')
    await tick(3000)
    expect(current().time.elapsedMs).toBe(countsUnfocused ? 5000 : 2000)
    hidden = true; await dispatch(document, 'visibilitychange')
    await tick(10000)
    expect(current().time.elapsedMs).toBe(countsUnfocused ? 5000 : 2000)
    hidden = false; await dispatch(document, 'visibilitychange')
    await tick(2000)
    expect(current().time.elapsedMs).toBe(countsUnfocused ? 7000 : 2000)
    focused = true; await dispatch(window, 'focus')
    await tick(1000)
    const beforeHide = countsUnfocused ? 8000 : 3000
    expect(current().time.elapsedMs).toBe(beforeHide)
    await dispatch(window, 'pagehide')
    await tick(5000)
    expect(current().time.elapsedMs).toBe(beforeHide)
    await dispatch(window, 'pageshow')
    await tick(1000)
    expect(current().time.elapsedMs).toBe(beforeHide + 1000)
    await act(async () => { current().stop() })
    await tick(5000)
    expect(current().time.elapsedMs).toBe(beforeHide + 1000)
  } finally {
    await act(async () => root.unmount())
    vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals()
  }
})
