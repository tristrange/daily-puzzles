import { puzzleDay, puzzleOfToday } from '../domain/dates'
import type { SolveRecord } from './stats'

const DAY_MS = 86_400_000
const WEEKLY_TARGET = 50
const WEEKLY_MILESTONES = [15, 30, WEEKLY_TARGET] as const

export type ChallengeGoal = {
  readonly id: string
  readonly label: string
  readonly progress: number
  readonly target: number
}

/** Challenges count first solves on the player's calendar, not puzzle publication dates. */
export function challengeProgress(records: readonly SolveRecord[], today: string, timeZone: string) {
  const monday = new Date(`${today}T00:00:00Z`)
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7)
  const weekStart = monday.toISOString().slice(0, 10)
  const earliest = monday.getTime() - DAY_MS
  const latest = Date.parse(`${today}T00:00:00Z`) + 2 * DAY_MS

  const firstSolves = new Map<string, SolveRecord>()
  for (const record of records) {
    const first = firstSolves.get(record.id)
    if (!first || record.solvedAt < first.solvedAt) firstSolves.set(record.id, record)
  }

  let weeklySolves = 0
  let dailySolves = 0
  let archiveSolves = 0
  const families = new Set<SolveRecord['puzzleType']>()
  for (const record of firstSolves.values()) {
    // The wider UTC bounds cover time-zone offsets; local calendar days decide inclusion.
    if (record.solvedAt < earliest || record.solvedAt >= latest) continue
    const solveDay = puzzleOfToday(new Date(record.solvedAt), timeZone)
    if (solveDay < weekStart || solveDay > today) continue
    weeklySolves++
    if (solveDay !== today) continue
    dailySolves++
    families.add(record.puzzleType)
    if (puzzleDay(record.id) < solveDay) archiveSolves++
  }

  const dailyGoals: readonly ChallengeGoal[] = [
    { id: 'puzzles', label: 'Solve 2 puzzles', progress: Math.min(dailySolves, 2), target: 2 },
    { id: 'variety', label: 'Solve puzzles from 2 different games', progress: Math.min(families.size, 2), target: 2 },
    { id: 'archive', label: 'Solve an archive puzzle', progress: Math.min(archiveSolves, 1), target: 1 },
  ]
  const weeklyGoals: readonly ChallengeGoal[] = WEEKLY_MILESTONES.map(target => ({
    id: String(target), label: `Solve ${target} puzzles`, progress: Math.min(weeklySolves, target), target,
  }))
  return {
    daily: { goals: dailyGoals, completed: dailyGoals.filter(goal => goal.progress === goal.target).length },
    weekly: { weekStart, solves: weeklySolves, target: WEEKLY_TARGET, goals: weeklyGoals },
  }
}
