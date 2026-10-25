import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react'
import type { PlayTime } from './playTime'
import { advanceWordClock } from '../domain/wordClock'

const pageActive = () => !document.hidden && document.hasFocus()

export function usePlayClock(initial: PlayTime, onSave: (time: PlayTime) => void) {
  const [time, setTime] = useState(initial)
  const baseline = useRef(initial.attemptElapsedMs === undefined ? null : initial.elapsedMs - initial.attemptElapsedMs)
  const clock = useRef({ elapsedMs: initial.elapsedMs, lastAt: 0, visible: false })
  const stopped = useRef(false), timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const save = useEffectEvent(onSave)
  const advance = useCallback((active: boolean) => {
    clock.current = advanceWordClock(clock.current, performance.now(), active && !stopped.current)
    return { elapsedMs: Math.floor(clock.current.elapsedMs), ...(baseline.current === null ? {}
      : { attemptElapsedMs: Math.floor(Math.max(0, clock.current.elapsedMs - baseline.current)) }) }
  }, [])
  const settle = useCallback(() => advance(pageActive()), [advance])
  const restartAttempt = useCallback(() => {
    if (stopped.current) return advance(false)
    advance(pageActive())
    baseline.current = clock.current.elapsedMs
    const snapshot = { elapsedMs: Math.floor(clock.current.elapsedMs), attemptElapsedMs: 0 }
    setTime(snapshot)
    return snapshot
  }, [advance])
  const stop = useCallback(() => {
    const time = advance(false)
    stopped.current = true
    if (timer.current !== null) clearInterval(timer.current)
    setTime(time)
    return time
  }, [advance])
  useEffect(() => {
    if (stopped.current) return
    clock.current = { ...clock.current, lastAt: performance.now(), visible: pageActive() }
    const flush = (active: boolean) => {
      if (stopped.current) return
      const time = advance(active)
      setTime(time); save(time)
    }
    const refresh = () => flush(pageActive()), pause = () => flush(false)
    timer.current = setInterval(refresh, 500)
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh); window.addEventListener('blur', pause)
    window.addEventListener('pageshow', refresh); window.addEventListener('pagehide', pause)
    return () => {
      if (timer.current !== null) clearInterval(timer.current)
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh); window.removeEventListener('blur', pause)
      window.removeEventListener('pageshow', refresh); window.removeEventListener('pagehide', pause)
      pause()
    }
  }, [advance])
  return { time, settle, stop, restartAttempt }
}
