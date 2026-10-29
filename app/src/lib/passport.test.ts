import { expect, it } from 'vitest'
import { PUZZLE_TYPES, type PuzzleType } from '../domain/board'
import { puzzleIdFor } from '../domain/dates'
import { PUZZLE_TYPE_PUBLISHED } from '../domain/games'
import type { SolveRecord } from './stats'
import { passportProgress, passportUnlocksForSolve } from './passport'

function solve(type: PuzzleType, day: string, solvedAt: number, hints = 0): SolveRecord {
  return { id: puzzleIdFor(day, type), puzzleType: type, size: 9, elapsedMs: 60_000, hints, solvedAt }
}

const publishedTypes = PUZZLE_TYPES.filter(type => PUZZLE_TYPE_PUBLISHED[type])

it('derives stamps from distinct puzzles, including archive games, variants and solves with hints', () => {
  const archived = solve('trio', '2026-09-26', 1, 4)
  const easy = solve('sudoku', '2026-10-20', 2)
  const hard = { ...easy, id: puzzleIdFor('2026-10-20', 'sudoku', undefined, 'hard'), solvedAt: 3 }
  const progress = passportProgress([archived, archived, easy, hard])
  expect(progress.earned).toBe(2)
  expect(progress.stamps).toHaveLength(publishedTypes.length)
  expect(progress.stamps.find(stamp => stamp.type === 'trio')?.count).toBe(1)
  expect(progress.stamps.find(stamp => stamp.type === 'sudoku')?.count).toBe(2)
  expect(progress.stamps.find(stamp => stamp.type === 'tents')?.count).toBe(0)
  expect(progress.explorer).toBe(false)
})

it('recognizes the first, tenth and twenty-fifth solve without awarding replays or unsaved records', () => {
  const records = Array.from({ length: 25 }, (_, i) => solve('trio', `2026-10-${String(i + 1).padStart(2, '0')}`, i + 1))
  for (const milestone of [1, 10, 25]) {
    const current = records[milestone - 1]!
    expect(passportUnlocksForSolve(records.slice(0, milestone), current)).toEqual([{ kind: 'stamp', type: 'trio', milestone }])
  }
  expect(passportUnlocksForSolve(records.slice(0, 11), records[10]!)).toEqual([])
  expect(passportUnlocksForSolve(records.slice(0, 9), records[9]!)).toEqual([])
  expect(passportUnlocksForSolve(records, { ...records[0]!, solvedAt: 999 })).toEqual([])
})

it('awards Explorer when the last game type receives its first stamp', () => {
  const records = publishedTypes.map((type, i) => solve(type, '2026-10-20', i + 1))
  expect(passportProgress(records).explorer).toBe(true)
  expect(passportUnlocksForSolve(records, records.at(-1)!)).toEqual([
    { kind: 'stamp', type: records.at(-1)!.puzzleType, milestone: 1 },
    { kind: 'explorer' },
  ])
})
