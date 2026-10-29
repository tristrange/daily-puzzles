import { expect, it } from 'vitest'
import { puzzleIdFor } from '../domain/dates'
import type { PuzzleType } from '../domain/board'
import type { SolveRecord } from './stats'
import { weeklyChallenge } from './weeklyChallenge'

function solve(id: string, puzzleType: PuzzleType, when: string, size = 9, hints = 0): SolveRecord {
  return { id, puzzleType, size, elapsedMs: 60_000, hints, solvedAt: Date.parse(when) }
}

it('uses Monday through Sunday in the local time zone, including a daylight-saving change', () => {
  const records = [
    solve('2026-10-25', 'queens', '2026-10-25T22:59:59Z'), // Sunday in Copenhagen
    solve('2026-10-26-star', 'star-battle', '2026-10-25T23:00:00Z'), // Monday in Copenhagen
    solve('2026-10-27-trio', 'trio', '2026-10-27T10:00:00Z', 9, 3),
    solve('2026-10-30-tents', 'tents', '2026-10-30T10:00:00Z'), // after today
  ]
  const result = weeklyChallenge(records, '2026-10-29', 'Europe/Copenhagen')
  expect(result.weekStart).toBe('2026-10-26')
  expect(result.goals[0]).toMatchObject({ id: 'variety', progress: 2, target: 3 })
  expect(weeklyChallenge(records, '2026-11-02', 'Europe/Copenhagen').goals[0]?.progress).toBe(0)
})

it.each([
  ['Pacific/Kiritimati', '2026-10-25T09:59:59Z', '2026-10-25T10:00:00Z'],
  ['America/Los_Angeles', '2026-10-26T06:59:59Z', '2026-10-26T07:00:00Z'],
])('starts Monday at local midnight in %s', (timeZone, sunday, monday) => {
  const records = [solve('2026-10-25', 'queens', sunday), solve('2026-10-26-trio', 'trio', monday)]
  expect(weeklyChallenge(records, '2026-10-26', timeZone).goals[0]?.progress).toBe(1)
})

it('counts an older puzzle as archive when it is solved, and counts each puzzle once', () => {
  const archive = solve('2026-09-28', 'queens', '2026-10-26T10:00:00Z', 8, 2)
  const today = solve('2026-10-26-trio', 'trio', '2026-10-26T11:00:00Z')
  const result = weeklyChallenge([archive, archive, today], '2026-10-29', 'UTC')
  expect(result.goals[0]?.progress).toBe(2)
  expect(result.goals[1]).toMatchObject({ id: 'archive', progress: 1, target: 1 })
  expect(result.completed).toBe(1)
})

it('does not count a first solve from an earlier week as a replay this week', () => {
  const old = solve('2026-09-28', 'queens', '2026-10-20T10:00:00Z', 8)
  const result = weeklyChallenge([old], '2026-10-29', 'UTC')
  expect(result.completed).toBe(0)
  expect(result.goals.every(goal => goal.progress === 0)).toBe(true)
})

it('rotates the variant goal each week and counts distinct sizes or levels', () => {
  const days = ['2026-10-26', '2026-11-02', '2026-11-09']
  const kinds = new Set<string>()
  for (const day of days) {
    const empty = weeklyChallenge([], day, 'UTC')
    const variant = empty.goals[2]!
    kinds.add(variant.id)
    const type = variant.id === 'tracks' ? 'train-tracks' : variant.id === 'sudoku' ? 'sudoku' : 'killer-sudoku'
    const ids = type === 'train-tracks'
      ? [puzzleIdFor(day, type, 'small'), puzzleIdFor(day, type, 'medium')]
      : [puzzleIdFor(day, type, undefined, 'easy'), puzzleIdFor(day, type, undefined, 'hard')]
    const records = ids.map((id, index) => solve(id, type, `${day}T12:00:00Z`, type === 'train-tracks' ? 8 + 2 * index : 9))
    expect(weeklyChallenge([records[0]!, records[0]!], day, 'UTC').goals[2]?.progress).toBe(1)
    expect(weeklyChallenge(records, day, 'UTC').goals[2]).toMatchObject({ progress: 2, target: 2 })
    const archive = solve('2026-09-28', 'queens', `${day}T13:00:00Z`, 8)
    const another = solve(puzzleIdFor(day, 'trio'), 'trio', `${day}T14:00:00Z`)
    expect(weeklyChallenge([...records, archive, another], day, 'UTC').completed).toBe(3)
    if (type === 'train-tracks') {
      const original = solve(puzzleIdFor(day, 'train-tracks'), 'train-tracks', `${day}T12:00:00Z`, 8)
      expect(weeklyChallenge([original, records[0]!], day, 'UTC').goals[2]?.progress).toBe(1)
    }
  }
  expect(kinds).toEqual(new Set(['tracks', 'sudoku', 'killer-sudoku']))
})

it('starts a new week correctly across the year boundary', () => {
  expect(weeklyChallenge([], '2027-01-01', 'UTC').weekStart).toBe('2026-12-28')
  expect(weeklyChallenge([], '2027-01-04', 'UTC').weekStart).toBe('2027-01-04')
})
