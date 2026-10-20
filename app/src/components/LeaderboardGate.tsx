import { lazy, Suspense, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'

// The provider is the only module that creates a Supabase client at startup.
// Keep it out of the landing/archive/stats routes: puzzle pages and the
// leaderboard are the only places that publish or read results.
const LeaderboardProvider = lazy(() =>
  import('./LeaderboardProvider').then((module) => ({ default: module.LeaderboardProvider })),
)

function preloadPage(pathname: string): Promise<unknown> {
  if (pathname.startsWith('/archive/')) return import('../pages/PuzzlePage')
  if (pathname === '/star-battle') return import('../pages/StarBattlePage')
  if (pathname === '/leaderboards') return import('../pages/LeaderboardsPage')
  return Promise.resolve()
}

export function LeaderboardGate() {
  const { pathname } = useLocation()
  // The lazy provider suspends this gate's children. Start the matched page
  // import now so it is already in flight beside the provider/SDK chunk.
  useEffect(() => { void preloadPage(pathname).catch(() => {}) }, [pathname])
  return (
    <Suspense fallback={<p className="status" role="status">Loading…</p>}>
      <LeaderboardProvider><Outlet /></LeaderboardProvider>
    </Suspense>
  )
}
