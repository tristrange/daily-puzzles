import { SUDOKU_LESSONS } from '../domain/sudokuLessons'

const KEY = 'daily-puzzles:sudoku-lessons:v1'

export function readCompletedLessons(): readonly string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    return Array.isArray(value) ? SUDOKU_LESSONS.filter(lesson => value.includes(lesson.id)).map(lesson => lesson.id) : []
  } catch { return [] }
}

export function storeCompletedLessons(ids: readonly string[]): boolean {
  try { localStorage.setItem(KEY, JSON.stringify(ids)); return true }
  catch { return false }
}
