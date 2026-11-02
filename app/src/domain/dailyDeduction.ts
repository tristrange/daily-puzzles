import { parsePuzzleDate } from './dates'
import { SUDOKU_LESSONS, type SudokuLesson } from './sudokuLessons'

// A small, explicit preview rotation. Keep the order stable across releases.
const PREVIEW_IDS = [
  'x-wing', 'xy-wing', 'swordfish',
  'x-wing-2', 'xy-wing-2', 'swordfish-2',
  'x-wing-3', 'xy-wing-3', 'swordfish-3',
] as const
const FIRST_DAY = parsePuzzleDate('2026-11-02').getTime()
const DAY_MS = 86_400_000

/** The same local calendar day selects the same prepared position for everyone. */
export function previewDeduction(day: string): SudokuLesson {
  const offset = Math.floor((parsePuzzleDate(day).getTime() - FIRST_DAY) / DAY_MS)
  const index = ((offset % PREVIEW_IDS.length) + PREVIEW_IDS.length) % PREVIEW_IDS.length
  const id = PREVIEW_IDS[index]
  const lesson = SUDOKU_LESSONS.find(candidate => candidate.id === id)
  if (!lesson) throw Error(`Missing deduction preview: ${id}`)
  return lesson
}
