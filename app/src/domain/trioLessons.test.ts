import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import certificate from '../../../docs/measurements/trio-lessons.json'
import catalog from '../data/trio-lessons.json'
import { trioCandidateNames } from './trioHints'
import { TRIO_NAMES } from './trio'
import { applyTrioLessonExample, checkTrioLessonAnswer, prepareTrioExercise, TRIO_LESSONS, TRIO_TECHNIQUES } from './trioLessons'

it('keeps twelve distinct source positions in three ordered techniques with guided first examples', () => {
  expect(TRIO_TECHNIQUES.map(technique => technique.id)).toEqual(['quota-no-three', 'relation-propagation', 'candidate-chains'])
  expect(TRIO_LESSONS).toHaveLength(12)
  expect(new Set(TRIO_LESSONS.map(lesson => lesson.source)).size).toBe(12)
  expect(TRIO_TECHNIQUES.every(technique => technique.exercises.map(lesson => lesson.guidance).join() === 'guided,practice,practice,practice')).toBe(true)
  expect(JSON.stringify(catalog)).not.toMatch(/solution/)
  expect(TRIO_LESSONS.map(lesson => lesson.id)).toEqual(certificate.lessons.map(lesson => lesson.id))
})

it.each(certificate.lessons)('matches the certified prefix, every scoped answer and exact source for $id', proof => {
  const lesson = TRIO_LESSONS.find(lesson => lesson.id === proof.id)!
  const masks = lesson.game.cells.map((value, cell) => value ? 1 << (value - 1) : lesson.game.notes[cell])
  expect(masks).toEqual(proof.candidates)
  expect(lesson.goal).toEqual(proof.goal)
  expect(lesson.examples.map(example => ({ cell: example.cell, after: example.candidates }))).toEqual(proof.examples.map(example => ({ cell: example.cell, after: example.after })))
  const raw = readFileSync(new URL(`../../public/puzzles/${lesson.source}.json`, import.meta.url))
  expect(createHash('sha256').update(raw).digest('hex')).toBe(proof.source_sha256)
  const source: unknown = JSON.parse(raw.toString('utf8'))
  expect(source).toMatchObject({ id: lesson.source, type: 'trio', board: { givens: lesson.board.givens, relations: lesson.board.relations } })
  for (const [index, example] of lesson.examples.entries()) {
    expect(example.hint.steps.map(step => ({ cell: step.cell, remove: step.before & ~step.after, rule: step.rule, group: [...step.group] }))).toEqual(proof.examples[index]!.witness)
    expect(checkTrioLessonAnswer(lesson, { cell: example.cell, candidates: example.candidates })).toBe(true)
    expect(checkTrioLessonAnswer(lesson, { cell: example.cell, candidates: lesson.game.notes[example.cell]! })).toBe(false)
    expect(checkTrioLessonAnswer(lesson, { cell: example.cell, candidates: 0 })).toBe(false)
    expect(example.reasons.length).toBeGreaterThanOrEqual(2)
    expect(example.reasons.length).toBeLessThanOrEqual(5)
    expect(example.reasons.at(-1)).toContain(trioCandidateNames(example.candidates))
    const solution = proof.unique_solution[example.cell]!
    expect(example.candidates & (1 << (solution - 1))).not.toBe(0)
    const applied = applyTrioLessonExample(lesson, example)
    expect(applied.cells.every((value, cell) => cell === example.cell || value === lesson.game.cells[cell])).toBe(true)
    expect(applied.notes.every((value, cell) => cell === example.cell || value === lesson.game.notes[cell])).toBe(true)
  }
})

it('accepts all qualified alternatives and rejects an over-restricted pair response', () => {
  const lesson = TRIO_LESSONS.find(lesson => lesson.guidance === 'practice' && lesson.examples.length > 1)!
  expect(lesson.examples.length).toBeGreaterThan(1)
  for (const example of lesson.examples) expect(checkTrioLessonAnswer(lesson, example)).toBe(true)
  for (const lesson of TRIO_TECHNIQUES[2]!.exercises) {
    for (const example of lesson.examples) {
      expect([1, 2, 4].filter(bit => example.candidates & bit)).toHaveLength(2)
      for (const bit of [1, 2, 4]) expect(checkTrioLessonAnswer(lesson, { cell: example.cell, candidates: bit })).toBe(false)
      expect(example.reasons.at(-1)).toContain(TRIO_NAMES[lesson.goal.remove])
    }
  }
})

it('rejects missing alternatives, changed witness premises, padding and malformed preparation', () => {
  const original = catalog[0]!.exercises.find(exercise => exercise.examples.length > 1)!
  const omitted = structuredClone(original); omitted.examples.pop()
  expect(() => prepareTrioExercise(omitted, 1, catalog[0]!.id)).toThrow('every scoped answer')
  const tampered = structuredClone(original); tampered.examples[0]!.witness[0]!.group = [0, 1, 2]
  expect(() => prepareTrioExercise(tampered, 1, catalog[0]!.id)).toThrow('unjustified premises')
  const padded = structuredClone(original); padded.examples[0]!.witness.unshift(padded.examples[0]!.witness[0]!)
  expect(() => prepareTrioExercise(padded, 1, catalog[0]!.id)).toThrow()
  const prefix = structuredClone(original); prefix.prefix = 9999
  expect(() => prepareTrioExercise(prefix, 1, catalog[0]!.id)).toThrow('prefix')
  const goal = structuredClone(original); goal.goal.line = 18
  expect(() => prepareTrioExercise(goal, 1, catalog[0]!.id)).toThrow('goal line')
  const partial = structuredClone(catalog[2]!.exercises[1]!)
  partial.examples[1]!.witness[0]!.remove = 2
  expect(() => prepareTrioExercise(partial, 1, catalog[2]!.id)).toThrow('full restriction')
})
