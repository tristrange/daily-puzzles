import { KILLER_LESSONS } from '../domain/killerLessons'

const KEY = 'daily-puzzles:killer-sudoku-lessons:v1'
export function readKillerLessons(): string[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    return Array.isArray(saved) ? KILLER_LESSONS.filter(lesson => saved.includes(lesson.id)).map(lesson => lesson.id) : []
  } catch { return [] }
}
export function completeKillerLesson(id: string): boolean {
  try {
    const completed = new Set([...readKillerLessons(), id])
    localStorage.setItem(KEY, JSON.stringify(KILLER_LESSONS.filter(lesson => completed.has(lesson.id)).map(lesson => lesson.id)))
    return true
  } catch { return false }
}
