import { expect, it } from 'vitest'
import { finishesTechnique, techniqueProgress } from './learningAchievements'

const exercises = [{ id: 'guided' }, { id: 'practice-1' }, { id: 'practice-2' }]

it('recognizes a technique only when every distinct exercise is complete', () => {
  expect(techniqueProgress(exercises, ['guided', 'guided', 'unknown'])).toEqual({ completed: 1, total: 3, practiced: false })
  expect(techniqueProgress(exercises, ['practice-2', 'guided', 'practice-1'])).toEqual({ completed: 3, total: 3, practiced: true })
  expect(techniqueProgress([], [])).toEqual({ completed: 0, total: 0, practiced: false })
})

it('recognizes the checked exercise that completes a technique, in any order', () => {
  expect(finishesTechnique(exercises, ['practice-1', 'practice-2'], 'guided')).toBe(true)
  expect(finishesTechnique(exercises, ['guided'], 'practice-1')).toBe(false)
  expect(finishesTechnique(exercises, ['guided', 'practice-1', 'practice-2'], 'guided')).toBe(false)
  expect(finishesTechnique(exercises, ['guided', 'practice-1'], 'unknown')).toBe(false)
})
