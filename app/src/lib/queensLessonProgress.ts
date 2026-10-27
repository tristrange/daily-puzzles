import { QUEENS_LESSONS } from '../domain/queensLessons'

const KEY = 'daily-puzzles:queens-lessons:v1'
export function readQueensLessons(): string[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    return Array.isArray(saved) ? QUEENS_LESSONS.filter(item => saved.includes(item.id)).map(item => item.id) : []
  } catch { return [] }
}
export function completeQueensLesson(id: string): boolean {
  try {
    const completed = new Set([...readQueensLessons(), id])
    localStorage.setItem(KEY, JSON.stringify(QUEENS_LESSONS.filter(item => completed.has(item.id)).map(item => item.id)))
    return true
  } catch { return false }
}
