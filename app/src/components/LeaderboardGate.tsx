import { lazy, Suspense } from 'react'
import { Outlet } from 'react-router-dom'

// The provider is the only module that creates a Supabase client at startup.
// Keep it out of the landing/archive/stats routes: puzzle pages and the
// leaderboard are the only places that publish or read results.
const LeaderboardProvider = lazy(() =>
  import('./LeaderboardProvider').then((module) => ({ default: module.LeaderboardProvider })),
)

export function LeaderboardGate() {
  return (
    <Suspense fallback={<p className="status" role="status">Loading…</p>}>
      <LeaderboardProvider><Outlet /></LeaderboardProvider>
    </Suspense>
  )
}
