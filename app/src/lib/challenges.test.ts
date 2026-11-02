import { expect, it } from 'vitest'
import { puzzleIdsForDay, puzzleTypeOf } from '../domain/dates'
import type { PuzzleType } from '../domain/board'
import type { SolveRecord } from './stats'
import { challengeProgress } from './challenges'

function solve(id: string, puzzleType: PuzzleType, when: string, hints = 0): SolveRecord {
  return { id, puzzleType, size: 9, elapsedMs: 60_000, hints, solvedAt: Date.parse(when) }
}

it('counts distinct first solves, game types and an archive puzzle for today', () => {
  const archive = solve('2026-10-20', 'queens', '2026-10-29T08:00:00Z', 2)
  const today = solve('2026-10-29-trio', 'trio', '2026-10-29T09:00:00Z')
  const progress = challengeProgress([archive, today, archive], '2026-10-29', 'UTC')

  expect(progress.daily.goals).toEqual([
    { id: 'puzzles', label: 'Solve 2 puzzles', progress: 2, target: 2 },
    { id: 'variety', label: 'Solve puzzles from 2 different games', progress: 2, target: 2 },
    { id: 'extra', label: 'Solve an archive puzzle or 3 puzzles total', progress: 1, target: 1 },
  ])
  expect(progress.daily.completed).toBe(3)
  expect(progress.weekly.solves).toBe(2)
})

it('allows completing the daily challenge without an unsolved archive puzzle', () => {
  const records = [
    solve('2026-10-29', 'queens', '2026-10-29T08:00:00Z'),
    solve('2026-10-29-trio', 'trio', '2026-10-29T09:00:00Z'),
    solve('2026-10-29-tents', 'tents', '2026-10-29T10:00:00Z'),
  ]
  expect(challengeProgress(records.slice(0, 2), '2026-10-29', 'UTC').daily.completed).toBe(2)
  expect(challengeProgress(records, '2026-10-29', 'UTC').daily.completed).toBe(3)
})

it.each([
  ['Pacific/Kiritimati', '2026-10-25T09:59:59Z', '2026-10-25T10:00:00Z'],
  ['America/Los_Angeles', '2026-10-26T06:59:59Z', '2026-10-26T07:00:00Z'],
])('starts each day and week at local midnight in %s', (timeZone, before, after) => {
  const records = [solve('2026-10-25', 'queens', before), solve('2026-10-26-trio', 'trio', after)]
  const progress = challengeProgress(records, '2026-10-26', timeZone)
  expect(progress.weekly.weekStart).toBe('2026-10-26')
  expect(progress.weekly.solves).toBe(1)
  expect(progress.daily.goals[0]?.progress).toBe(1)
})

it('resets the daily goals at midnight without losing the current week', () => {
  const records = [
    solve('2026-10-25', 'queens', '2026-10-25T22:59:59Z'),
    solve('2026-10-26-star', 'star-battle', '2026-10-25T23:00:00Z'),
    solve('2026-10-27-trio', 'trio', '2026-10-27T10:00:00Z'),
    solve('2026-10-30-tents', 'tents', '2026-10-30T10:00:00Z'),
  ]
  const thursday = challengeProgress(records, '2026-10-29', 'Europe/Copenhagen')
  expect(thursday.weekly.weekStart).toBe('2026-10-26')
  expect(thursday.weekly.solves).toBe(2)
  expect(thursday.daily.goals.every(goal => goal.progress === 0)).toBe(true)
  expect(challengeProgress(records, '2026-11-02', 'Europe/Copenhagen').weekly.solves).toBe(0)
})

it('does not count a replay when the first solve was earlier', () => {
  const first = solve('2026-09-28', 'queens', '2026-10-20T10:00:00Z')
  const replay = solve(first.id, 'queens', '2026-10-29T10:00:00Z')
  const progress = challengeProgress([replay, first], '2026-10-29', 'UTC')
  expect(progress.weekly.solves).toBe(0)
  expect(progress.daily.completed).toBe(0)
})

it('counts different puzzle variants towards a 50-solve week without requiring daily play', () => {
  const ids = ['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'].flatMap(puzzleIdsForDay)
  const records = ids.map(id => solve(id, puzzleTypeOf(id)!, '2026-10-26T10:00:00Z', 1))
  expect(records.length).toBeGreaterThanOrEqual(50)

  const before = challengeProgress(records.slice(0, 49), '2026-10-26', 'UTC')
  expect(before.weekly.solves).toBe(49)
  expect(before.weekly.target).toBe(50)
  expect(before.weekly.goals.map(goal => goal.progress)).toEqual([15, 30, 49])

  const complete = challengeProgress([...records.slice(0, 50), records[0]!], '2026-10-26', 'UTC')
  expect(complete.weekly.solves).toBe(50)
  expect(complete.weekly.goals.map(goal => goal.progress)).toEqual([15, 30, 50])
  expect(complete.weekly.goals.every(goal => goal.progress === goal.target)).toBe(true)
})

it('starts a new weekly challenge across the year boundary', () => {
  expect(challengeProgress([], '2027-01-01', 'UTC').weekly.weekStart).toBe('2026-12-28')
  expect(challengeProgress([], '2027-01-04', 'UTC').weekly.weekStart).toBe('2027-01-04')
})
