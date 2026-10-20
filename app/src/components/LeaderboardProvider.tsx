import { useEffect, useState, type ReactNode } from 'react'
import { createLeaderboardClient, parseLeaderboardConfig } from '../lib/leaderboard'
import { createLeaderboardStore, type LeaderboardStore } from '../lib/leaderboardProgress'
import { LeaderboardContext } from '../lib/useLeaderboard'

let browserStore: LeaderboardStore | null = null

function getBrowserStore(): LeaderboardStore {
  if (!browserStore) {
    const config = parseLeaderboardConfig(import.meta.env)
    let storage: Storage | null = null
    try { storage = localStorage } catch { /* Local games remain available without publishing. */ }
    browserStore = createLeaderboardStore(config, config ? createLeaderboardClient(config) : null, storage)
  }
  return browserStore
}

export function LeaderboardProvider({ children }: { children: ReactNode }) {
  const [store] = useState(getBrowserStore)
  useEffect(() => store.start(), [store])
  return <LeaderboardContext.Provider value={store}>{children}</LeaderboardContext.Provider>
}
