import { useEffect, useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { isPuzzleId } from '../domain/dates'
import { cameFromToday } from '../lib/puzzleNavigation'

const RETURN_KEY = 'daily-puzzles:lesson-return'
const RETURN_TODAY_KEY = 'daily-puzzles:lesson-return-today'
const PREVIEW_PATHS = new Set(['/preview/sudoku', '/preview/killer-sudoku', '/preview/trio', '/preview/tents', '/preview/nurikabe'])

function puzzleReturn(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const pathname = value.split('?')[0]!
  return (pathname.startsWith('/archive/') && isPuzzleId(pathname.slice('/archive/'.length))) || PREVIEW_PATHS.has(pathname) ? value : null
}

function initialReturn(state: unknown): { path: string; fromToday: boolean } | null {
  if (typeof state === 'object' && state !== null && 'returnTo' in state) {
    const fromPuzzle = puzzleReturn(state.returnTo)
    if (fromPuzzle) return { path: fromPuzzle, fromToday: cameFromToday(state) }
  }
  try {
    const path = puzzleReturn(sessionStorage.getItem(RETURN_KEY))
    return path ? { path, fromToday: sessionStorage.getItem(RETURN_TODAY_KEY) === 'true' } : null
  } catch { return null }
}

export function LessonLayout() {
  const { state } = useLocation()
  const [returnTo] = useState(() => initialReturn(state))

  useEffect(() => {
    if (!returnTo) return
    try {
      sessionStorage.setItem(RETURN_KEY, returnTo.path)
      if (returnTo.fromToday) sessionStorage.setItem(RETURN_TODAY_KEY, 'true')
      else sessionStorage.removeItem(RETURN_TODAY_KEY)
    } catch { /* The link still works during this visit. */ }
    return () => { try { sessionStorage.removeItem(RETURN_KEY); sessionStorage.removeItem(RETURN_TODAY_KEY) } catch { /* Storage may be unavailable. */ } }
  }, [returnTo])

  return <>
    {returnTo && <nav className="lesson-return" aria-label="Return to puzzle"><Link className="lesson-back" to={returnTo.path} state={returnTo.fromToday ? { fromToday: true } : undefined}>← Return to puzzle</Link></nav>}
    <Outlet />
  </>
}
