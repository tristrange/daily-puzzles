import { useEffect, useState } from 'react'
import { puzzleOfToday } from '../domain/dates'

/**
 * The player's puzzle day, refreshed at local midnight.
 *
 * `puzzleOfToday` is pure, but a page that calls it once during its first render
 * keeps yesterday's board after midnight. Every caller resolves `timeZone` from
 * the same browser, so the next local midnight is the correct boundary for the
 * returned day. Timers can be throttled, and a page can be restored from the
 * back/forward cache, so visibility, focus and pageshow also reread the clock.
 */
export function useToday(timeZone: string): string {
  const [today, setToday] = useState(() => puzzleOfToday(new Date(), timeZone))
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const refresh = () => setToday(puzzleOfToday(new Date(), timeZone))
    const schedule = () => {
      const now = new Date()
      const midnight = new Date(now)
      midnight.setHours(24, 0, 0, 0)
      timer = setTimeout(() => {
        refresh()
        schedule()
      }, Math.max(0, midnight.getTime() - now.getTime()))
    }
    schedule()
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)
    window.addEventListener('pageshow', refresh)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('pageshow', refresh)
    }
  }, [timeZone])
  return today
}
