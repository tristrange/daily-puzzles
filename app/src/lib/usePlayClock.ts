import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react'
import type { PlayTime } from './playTime'
import { advanceWordClock } from '../domain/wordClock'

// iPhone Safari can leave a visible page unfocused after its tab overview closes.
// Visibility is the only reliable signal there, so the overview may count as play.
const isIPhone = () => typeof navigator !== 'undefined' && /iPhone|iPod/i.test(`${navigator.userAgent} ${navigator.platform}`)
const pageActive = () => !document.hidden && (isIPhone() || document.hasFocus())

export function usePlayClock(initial: PlayTime, onSave: (time: PlayTime) => void) {
  const [time, setTime] = useState(initial)
  const baseline = useRef(initial.attemptElapsedMs === undefined ? null : initial.elapsedMs - initial.attemptElapsedMs)
  const clock = useRef({ elapsedMs: initial.elapsedMs, lastAt: 0, visible: false })
  const stopped = useRef(false), timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const pageShown = useRef(true)
  const save = useEffectEvent(onSave)
  const advance = useCallback((active: boolean) => {
    clock.current = advanceWordClock(clock.current, performance.now(), active && !stopped.current)
    return { elapsedMs: Math.floor(clock.current.elapsedMs), ...(baseline.current === null ? {}
      : { attemptElapsedMs: Math.floor(Math.max(0, clock.current.elapsedMs - baseline.current)) }) }
  }, [])
  const active = useCallback(() => pageShown.current && pageActive(), [])
  const settle = useCallback(() => advance(active()), [advance, active])
  const restartAttempt = useCallback(() => {
    if (stopped.current) return advance(false)
    advance(active())
    baseline.current = clock.current.elapsedMs
    const snapshot = { elapsedMs: Math.floor(clock.current.elapsedMs), attemptElapsedMs: 0 }
    setTime(snapshot)
    return snapshot
  }, [advance, active])
  const stop = useCallback(() => {
    const time = advance(false)
    stopped.current = true
    if (timer.current !== null) clearInterval(timer.current)
    setTime(time)
    return time
  }, [advance])
  useEffect(() => {
    if (stopped.current) return
    clock.current = { ...clock.current, lastAt: performance.now(), visible: active() }
    const flush = (active: boolean) => {
      if (stopped.current) return
      const time = advance(active)
      setTime(time); save(time)
    }
    const refresh = () => flush(active()), pause = () => flush(false)
    const blur = () => { if (isIPhone()) refresh(); else pause() }
    const show = () => { pageShown.current = true; refresh() }
    const hide = () => { pageShown.current = false; pause() }
    timer.current = setInterval(refresh, 500)
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh); window.addEventListener('blur', blur)
    window.addEventListener('pageshow', show); window.addEventListener('pagehide', hide)
    return () => {
      if (timer.current !== null) clearInterval(timer.current)
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh); window.removeEventListener('blur', blur)
      window.removeEventListener('pageshow', show); window.removeEventListener('pagehide', hide)
      pause()
    }
  }, [advance, active])
  return { time, settle, stop, restartAttempt }
}
