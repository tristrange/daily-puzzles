import { useRef } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { ThemePicker } from './ThemePicker'
import { OfflineStatus } from './OfflineStatus'

function navClass({ isActive }: { isActive: boolean }): string {
  return isActive ? 'nav-link active' : 'nav-link'
}

export function Shell() {
  const content = useRef<HTMLElement>(null)
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
          <NavLink to="/" end className={navClass}>
            Today
          </NavLink>
          <NavLink to="/archive" className={navClass}>
            Archive
          </NavLink>
          <NavLink to="/stats" className={navClass}>
            Stats
          </NavLink>
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
      <footer className="site-footer">
        <span>A little logic, every day.</span>
        <span>Hand-built. Played at your pace.</span>
      </footer>
    </div>
  )
}
