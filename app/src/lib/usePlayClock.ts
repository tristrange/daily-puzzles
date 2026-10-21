import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react'
import { advanceWordClock } from '../domain/wordClock'

const pageActive = () => !document.hidden && document.hasFocus()

/** One focused-play duration for the display, saves and final result. */
export function usePlayClock(initialElapsedMs: number, onSave: (elapsedMs: number) => void) {
  const [elapsed, setElapsed] = useState(initialElapsedMs)
  const clock = useRef({ elapsedMs: initialElapsedMs, lastAt: 0, visible: false })
  const stopped = useRef(false), timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const save = useEffectEvent(onSave)
  const advance = useCallback((active: boolean) => {
    clock.current = advanceWordClock(clock.current, performance.now(), active && !stopped.current)
    return Math.floor(clock.current.elapsedMs)
  }, [])
  const settle = useCallback(() => advance(pageActive()), [advance])
  const stop = useCallback(() => {
    const time = advance(false)
    stopped.current = true
    if (timer.current !== null) clearInterval(timer.current)
    setElapsed(time)
    return time
  }, [advance])
  useEffect(() => {
    if (stopped.current) return
    clock.current = { ...clock.current, lastAt: performance.now(), visible: pageActive() }
    const flush = (active: boolean) => {
      if (stopped.current) return
      const time = advance(active)
      setElapsed(time); save(time)
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
  return { elapsed, settle, stop }
}
