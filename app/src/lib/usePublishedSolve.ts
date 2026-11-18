import { useState } from 'react'
import { puzzleOfToday } from '../domain/dates'
import { summarise, tryStoreSolve, type SolveRecord } from './stats'
import { useLeaderboard } from './useLeaderboard'

type State =
  | { kind: 'pending'; record: SolveRecord }
  | { kind: 'saved'; firstSolve: SolveRecord | null; candidate: SolveRecord | null; streak: number }

export function usePublishedSolve(timeZone: string, clearProgress: () => void) {
  const [state, setState] = useState<State | null>(null)
  const { offerSolve } = useLeaderboard()

  const save = (record: SolveRecord) => {
    const { records, firstSolve, persisted } = tryStoreSolve(record)
    if (!persisted) {
      setState({ kind: 'pending', record })
      return false
    }
    clearProgress()
    const candidate = firstSolve === null ? record : null
    const { currentStreak: streak } = summarise(records, puzzleOfToday(new Date(record.solvedAt), timeZone))
    setState({ kind: 'saved', firstSolve, candidate, streak })
    if (candidate) void offerSolve(candidate)
    return true
  }

  return {
    save,
    saved: state?.kind === 'saved' ? state : null,
    retry: state?.kind === 'pending' ? () => { save(state.record) } : undefined,
  }
}
