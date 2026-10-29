import { puzzleDay, puzzleOfToday } from '../domain/dates'
import { killerVariantOf, sudokuVariantOf } from '../domain/sudokuLevels'
import { TRACK_VARIANTS, trackVariantOf } from '../domain/trackSizes'
import type { SolveRecord } from './stats'

const DAY_MS = 86_400_000
const VARIANTS = ['tracks', 'sudoku', 'killer-sudoku'] as const

/** Weekly goals use the player's calendar, not the puzzle's publication date. */
export function weeklyChallenge(records: readonly SolveRecord[], today: string, timeZone: string) {
  const monday = new Date(`${today}T00:00:00Z`)
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7)
  const weekStart = monday.toISOString().slice(0, 10)
  const weekNumber = Math.floor(monday.getTime() / (7 * DAY_MS))
  const featured = VARIANTS[((weekNumber % VARIANTS.length) + VARIANTS.length) % VARIANTS.length]!

  const families = new Set<string>()
  const archive = new Set<string>()
  const variants = new Set<string | number>()
  const seen = new Set<string>()
  // UTC bounds are deliberately wider than any time zone; the local-day check
  // below decides inclusion and avoids formatting the player's entire history.
  const earliest = monday.getTime() - DAY_MS
  const latest = Date.parse(`${today}T00:00:00Z`) + 2 * DAY_MS
  for (const record of records) {
    if (record.solvedAt < earliest || record.solvedAt >= latest || seen.has(record.id)) continue
    const solveDay = puzzleOfToday(new Date(record.solvedAt), timeZone)
    if (solveDay < weekStart || solveDay > today) continue
    seen.add(record.id)
    families.add(record.puzzleType)
    if (puzzleDay(record.id) < solveDay) archive.add(record.id)
    if (featured === 'tracks' && record.puzzleType === 'train-tracks') {
      const size = trackVariantOf(record.id)?.side ?? record.size
      if (TRACK_VARIANTS.some(variant => variant.side === size)) variants.add(size)
    } else if (featured === 'sudoku' && record.puzzleType === 'sudoku') {
      const level = sudokuVariantOf(record.id)
      if (level) variants.add(level.name)
    } else if (featured === 'killer-sudoku' && record.puzzleType === 'killer-sudoku') {
      const level = killerVariantOf(record.id)
      if (level) variants.add(level.name)
    }
  }
  const featuredLabel = featured === 'tracks' ? 'Solve 2 different Train Tracks sizes'
    : featured === 'sudoku' ? 'Solve 2 different Sudoku levels' : 'Solve 2 different Killer Sudoku levels'
  const goals = [
    { id: 'variety', label: 'Solve puzzles from 3 different games', progress: Math.min(families.size, 3), target: 3 },
    { id: 'archive', label: 'Solve an archive puzzle', progress: Math.min(archive.size, 1), target: 1 },
    { id: featured, label: featuredLabel, progress: Math.min(variants.size, 2), target: 2 },
  ]
  return { weekStart, goals, completed: goals.filter(goal => goal.progress >= goal.target).length }
}
