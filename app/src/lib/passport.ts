import { PUZZLE_TYPES, type PuzzleType } from '../domain/board'
import { PUZZLE_TYPE_PUBLISHED } from '../domain/games'
import type { SolveRecord } from './stats'

export const PASSPORT_MILESTONES = [1, 10, 25] as const
type Milestone = typeof PASSPORT_MILESTONES[number]

export type PassportUnlock =
  | { kind: 'stamp'; type: PuzzleType; milestone: Milestone }
  | { kind: 'explorer' }

/** Derive the collection from the same first-solve history used by Stats. */
export function passportProgress(records: readonly SolveRecord[]) {
  const types = PUZZLE_TYPES.filter(type => PUZZLE_TYPE_PUBLISHED[type])
  const ids = new Map<PuzzleType, Set<string>>()
  for (const type of types) ids.set(type, new Set())
  for (const record of records) ids.get(record.puzzleType)?.add(record.id)
  const stamps = types.map(type => ({ type, count: ids.get(type)!.size }))
  const earned = stamps.filter(stamp => stamp.count > 0).length
  return { stamps, earned, total: stamps.length, explorer: stamps.length > 0 && earned === stamps.length }
}

/** Only celebrate a solve that actually made it into local history. */
export function passportUnlocksForSolve(records: readonly SolveRecord[], candidate: SolveRecord): PassportUnlock[] {
  if (!records.some(record => record.id === candidate.id && record.puzzleType === candidate.puzzleType && record.solvedAt === candidate.solvedAt)) return []
  const before = passportProgress(records.filter(record => record.id !== candidate.id))
  const after = passportProgress(records)
  const previous = before.stamps.find(stamp => stamp.type === candidate.puzzleType)
  const current = after.stamps.find(stamp => stamp.type === candidate.puzzleType)
  if (!previous || !current) return []
  const unlocks: PassportUnlock[] = PASSPORT_MILESTONES
    .filter(milestone => previous.count < milestone && current.count >= milestone)
    .map(milestone => ({ kind: 'stamp', type: candidate.puzzleType, milestone }))
  if (!before.explorer && after.explorer) unlocks.push({ kind: 'explorer' })
  return unlocks
}
