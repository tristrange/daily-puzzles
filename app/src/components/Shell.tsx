import { useRef } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { ThemePicker } from './ThemePicker'
import { OfflineStatus } from './OfflineStatus'
import { cameFromToday } from '../lib/puzzleNavigation'

function navClass({ isActive }: { isActive: boolean }): string {
  return isActive ? 'nav-link active' : 'nav-link'
}

export function Shell() {
  const content = useRef<HTMLElement>(null)
  const location = useLocation()
  const archivePage = location.pathname === '/archive' || location.pathname.startsWith('/archive/')
  const today = location.pathname === '/' || (location.pathname.startsWith('/archive/') && cameFromToday(location.state))
  return (
    <div className="shell">
      <a className="skip-link" href="#main-content" onClick={(event) => {
        // HashRouter owns fragments, so skipping moves focus without navigating.
        event.preventDefault()
        content.current?.focus()
      }}>Skip to content</a>
      <header className="site-header">
        <Link className="brand" to="/" aria-label="Daily Puzzles, today">
          <span className="brand-mark" aria-hidden="true"><i /><i /><i /><i /></span>
          Daily&nbsp;Puzzles
        </Link>
        <nav aria-label="Main">
          <Link to="/" className={navClass({ isActive: today })} aria-current={today ? 'page' : undefined}>
            Today
          </Link>
          <Link to="/archive" className={navClass({ isActive: archivePage && !today })} aria-current={archivePage && !today ? 'page' : undefined}>
            Archive
          </Link>
          <NavLink to="/stats" className={navClass}>
            Stats
          </NavLink>
          <NavLink to="/leaderboards" className={navClass} aria-label="Leaderboards"><span className="leaderboards-nav-full">Leaderboards</span><span className="leaderboards-nav-short" aria-hidden="true">Ranks</span></NavLink>
          <NavLink to="/learn" className={navClass}>Learn</NavLink>
          <NavLink to="/how-to-play" className={navClass}>
            How to play
          </NavLink>
        </nav>
        <ThemePicker />
      </header>
      <OfflineStatus />
      <main ref={content} className="content" id="main-content" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  )
}
