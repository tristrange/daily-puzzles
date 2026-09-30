import { NavLink, Outlet } from 'react-router-dom'

function navClass({ isActive }: { isActive: boolean }): string {
  return isActive ? 'nav-link active' : 'nav-link'
}

export function Shell() {
  return (
    <div className="shell">
      <header className="site-header">
        <span className="brand" aria-hidden="true">
          Daily&nbsp;Puzzles
        </span>
        <nav aria-label="Main">
          <NavLink to="/" end className={navClass}>
            Today
          </NavLink>
          <NavLink to="/archive" className={navClass}>
            Archive
          </NavLink>
        </nav>
      </header>
      <main className="content">
        <Outlet />
      </main>
      <footer className="site-footer">A hand-built daily logic puzzle app.</footer>
    </div>
  )
}