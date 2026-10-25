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
