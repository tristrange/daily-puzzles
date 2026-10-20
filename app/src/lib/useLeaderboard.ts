import { createContext, useContext, useSyncExternalStore } from 'react'
import { createLeaderboardStore, type LeaderboardStore } from './leaderboardProgress'

export const LeaderboardContext = createContext<LeaderboardStore>(createLeaderboardStore(null, null, null))

export function useLeaderboard() {
  const store = useContext(LeaderboardContext)
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  return { ...state, ...store }
}
