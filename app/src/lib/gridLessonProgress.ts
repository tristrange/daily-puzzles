import { GRID_LESSONS, type GridLesson } from '../domain/gridLessons'

const key = (kind: GridLesson['kind']) => `daily-puzzles:${kind}-lessons:v1`
export function readGridLessons(kind: GridLesson['kind']): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key(kind)) ?? 'null')
    return Array.isArray(value) ? GRID_LESSONS.filter(lesson => lesson.kind === kind && value.includes(lesson.id)).map(lesson => lesson.id) : []
  } catch { return [] }
}
export function completeGridLesson(kind: GridLesson['kind'], id: string): boolean {
  try {
    const completed = new Set([...readGridLessons(kind), id])
    localStorage.setItem(key(kind), JSON.stringify(GRID_LESSONS.filter(lesson => lesson.kind === kind && completed.has(lesson.id)).map(lesson => lesson.id)))
    return true
  } catch { return false }
}
