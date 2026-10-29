import { KILLER_LESSONS } from '../domain/killerLessons'
import { KILLER_FORTY_FIVE_LESSONS } from '../domain/killerFortyFiveLessons'

const KEY = 'daily-puzzles:killer-sudoku-lessons:v1'
const LESSONS = [...KILLER_LESSONS, ...KILLER_FORTY_FIVE_LESSONS]
export function readKillerLessons(): string[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    return Array.isArray(saved) ? LESSONS.filter(lesson => saved.includes(lesson.id)).map(lesson => lesson.id) : []
  } catch { return [] }
}
export function completeKillerLesson(id: string): boolean {
  try {
    const completed = new Set([...readKillerLessons(), id])
    localStorage.setItem(KEY, JSON.stringify(LESSONS.filter(lesson => completed.has(lesson.id)).map(lesson => lesson.id)))
    return true
  } catch { return false }
}
