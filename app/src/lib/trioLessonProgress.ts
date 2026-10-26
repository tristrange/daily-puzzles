import { TRIO_LESSONS } from '../domain/trioLessons'

const KEY = 'daily-puzzles:trio-lessons:v1'
export function readCompletedTrioLessons(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    return Array.isArray(value) ? TRIO_LESSONS.filter(lesson => value.includes(lesson.id)).map(lesson => lesson.id) : []
  } catch { return [] }
}
export function storeCompletedTrioLessons(ids: readonly string[]): boolean {
  try {
    const merged = [...ids, ...readCompletedTrioLessons()]
    localStorage.setItem(KEY, JSON.stringify(TRIO_LESSONS.filter(lesson => merged.includes(lesson.id)).map(lesson => lesson.id)))
    return true
  } catch { return false }
}
