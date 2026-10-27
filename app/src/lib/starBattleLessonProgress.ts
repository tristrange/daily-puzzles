import { STAR_BATTLE_LESSONS } from '../domain/starBattleLessons'
import { STAR_BATTLE_CHAINS } from '../domain/starBattleChains'

const KEY = 'daily-puzzles:star-battle-lessons:v1'
const lessons = [...STAR_BATTLE_LESSONS, ...STAR_BATTLE_CHAINS]

export function readCompletedStarBattleLessons(): readonly string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    return Array.isArray(value) ? lessons.filter(lesson => value.includes(lesson.id)).map(lesson => lesson.id) : []
  } catch { return [] }
}

export function storeCompletedStarBattleLessons(ids: readonly string[]): boolean {
  try {
    const known = lessons.filter(lesson => ids.includes(lesson.id)).map(lesson => lesson.id)
    localStorage.setItem(KEY, JSON.stringify(known))
    return true
  } catch { return false }
}
