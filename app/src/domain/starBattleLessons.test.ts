import { expect, it } from 'vitest'
import certificates from '../../../docs/measurements/star-battle-lessons.json'
import catalog from '../data/star-battle-lessons.json'
import { firstHint } from './hints'
import { STAR_BATTLE_LESSONS, STAR_BATTLE_TECHNIQUES, prepareStarBattleExercise, starLessonGroupCells } from './starBattleLessons'

it('keeps four ordered techniques, three distinct exercises each and guided first examples', () => {
  expect(STAR_BATTLE_TECHNIQUES.map(technique => technique.title)).toEqual(['Last space', 'Fill remaining spaces', 'Locked spaces', 'Group reservation'])
  expect(STAR_BATTLE_LESSONS).toHaveLength(12)
  expect(new Set(STAR_BATTLE_LESSONS.map(lesson => JSON.stringify(lesson.board.regions))).size).toBe(12)
  expect(STAR_BATTLE_LESSONS.map(lesson => lesson.id)).toEqual(certificates.lessons.map(lesson => lesson.id))
  expect(STAR_BATTLE_TECHNIQUES.every(technique => technique.exercises.map(exercise => exercise.guidance).join() === 'guided,practice,practice')).toBe(true)
  expect(JSON.stringify(catalog)).not.toMatch(/solution/)
})

it.each(certificates.lessons)('matches the independent exact certificate for $id', certificate => {
  const lesson = STAR_BATTLE_LESSONS.find(lesson => lesson.id === certificate.id)
  if (!lesson) throw Error('Missing lesson')
  expect([...lesson.game.queens]).toEqual(certificate.queens)
  expect([...lesson.game.marks]).toEqual(certificate.marks)
  expect(firstHint(lesson.board, lesson.game.queens, lesson.game.marks)).toMatchObject(certificate.move)
  expect(lesson.witness).toEqual(certificate.witness)
  expect([...lesson.game.queens].every(cell => certificate.unique_solution.includes(cell))).toBe(true)
  expect([...lesson.game.marks].some(cell => certificate.unique_solution.includes(cell))).toBe(false)
  expect(certificate.unique_solution.includes(lesson.hint.cell)).toBe(lesson.hint.action === 'queen')
  expect([...lesson.hint.support].sort((a, b) => a - b)).toEqual(certificate.support)
  expect(lesson.hint.support).not.toContain(lesson.hint.cell)
  for (const group of [...lesson.witness.sources, ...lesson.witness.homes]) {
    for (const cell of starLessonGroupCells(lesson.board, group)) {
      if (cell !== lesson.hint.cell) expect(lesson.hint.support).toContain(cell)
    }
    expect(group.candidates).toEqual(starLessonGroupCells(lesson.board, group).filter(cell => certificate.available.includes(cell)))
  }
})

it('rejects changed targets and rules instead of replacing the advertised move', () => {
  const original = catalog[0]?.exercises[0]
  if (!original) throw Error('Missing lesson')
  const target = structuredClone(original)
  target.expected.cell += 1
  expect(() => prepareStarBattleExercise(target, 0)).toThrow('differs from its certificate')
  const rule = structuredClone(original)
  rule.expected.rule = 'subset'
  expect(() => prepareStarBattleExercise(rule, 0)).toThrow('differs from its certificate')
})
