import catalog from '../data/trio-lessons.json'
import { isTrioValue, TRIO_LINES, TRIO_NAMES, TrioGrid, type TrioBoard, type TrioGame, type TrioValue } from './trio'
import { deduceTrio, trioCandidateNames, type TrioHint, type TrioHintStep } from './trioHints'

type Descriptor = typeof catalog[number]['exercises'][number]
type Restriction = Descriptor['examples'][number]['witness'][number]
const symbols = [1, 2, 3] as const
const bits = [1, 2, 4]
const single = (mask: number) => mask > 0 && (mask & (mask - 1)) === 0
const position = (cell: number) => `R${Math.floor(cell / 9) + 1}C${cell % 9 + 1}`
const equal = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((cell, i) => cell === b[i])
const windows = TRIO_LINES.flatMap(line => Array.from({ length: 7 }, (_, start) => line.slice(start, start + 3)))

function ruleOptions(board: TrioBoard, masks: readonly number[], action: Restriction): { allowed: number; premise: string }[] {
  const { cell, group, rule } = action
  if (!group.includes(cell)) return []
  if (rule === 'row-count' || rule === 'column-count') {
    const index = TRIO_LINES.findIndex(line => equal(line, group))
    if (index < 0 || (index < 9) !== (rule === 'row-count')) return []
    const line = `${index < 9 ? 'Row' : 'Column'} ${index % 9 + 1}`
    return symbols.flatMap(symbol => {
      const bit = 1 << (symbol - 1), fixed = group.filter(c => masks[c] === bit), possible = group.filter(c => masks[c]! & bit)
      const options = []
      if (fixed.length === 3) options.push({ allowed: 7 ^ bit, premise: `${line} has its three ${TRIO_NAMES[symbol]} symbols (${fixed.map(position).join(', ')}).` })
      if (possible.length === 3 && possible.includes(cell)) options.push({ allowed: bit, premise: `${line} can place its three ${TRIO_NAMES[symbol]} symbols only at ${possible.map(position).join(', ')}.` })
      return options
    })
  }
  if (rule === 'no-three') {
    if (!windows.some(window => equal(window, group))) return []
    return symbols.filter(symbol => group.filter(c => c !== cell).every(c => masks[c] === 1 << (symbol - 1)))
      .map(symbol => ({ allowed: 7 ^ (1 << (symbol - 1)), premise: `${group.filter(c => c !== cell).map(position).join(' and ')} are ${TRIO_NAMES[symbol]}. This run cannot contain a third.` }))
  }
  const edge = board.relations.find(edge => equal([edge.first, edge.second], group) && edge.kind === rule)
  if (!edge) return []
  const other = edge.first === cell ? edge.second : edge.first, mask = masks[other]!
  if (rule === 'same') return [{ allowed: mask, premise: `The = link shares ${position(other)}'s candidates (${trioCandidateNames(mask)}).` }]
  if (rule === 'different' && single(mask)) return [{ allowed: 7 ^ mask, premise: `The × link must differ from ${position(other)} (${trioCandidateNames(mask)}).` }]
  return []
}

function replayWitness(board: TrioBoard, prepared: readonly number[], actions: readonly Restriction[]) {
  const masks = [...prepared], steps: TrioHintStep[] = []
  for (const action of actions) {
    const before = masks[action.cell]!
    const option = ruleOptions(board, masks, action).find(option => !(action.remove & option.allowed))
    const after = before & ~action.remove
    if (!option || !action.remove || (before & action.remove) !== action.remove || !after) throw Error('Trio lesson witness has unjustified premises')
    const effect = ruleOptions(board, masks, action).reduce((mask, option) => mask & option.allowed, before)
    if (effect !== after) throw Error('Trio lesson witness must show the full restriction of its stated rule')
    const rule = action.rule
    if (rule !== 'row-count' && rule !== 'column-count' && rule !== 'no-three' && rule !== 'same' && rule !== 'different') throw Error('Invalid Trio lesson rule')
    const conclusion = single(after) ? `${position(action.cell)} must be ${trioCandidateNames(after)}.`
      : `${position(action.cell)} excludes ${trioCandidateNames(action.remove)}; ${trioCandidateNames(after)} remain.`
    steps.push({ cell: action.cell, before, after, rule, group: action.group, dependencies: [],
      reason: `${option.premise} ${conclusion}` })
    masks[action.cell] = after
  }
  return { masks, steps }
}

export function prepareTrioExercise(exercise: Descriptor, index: number, techniqueId: string) {
  const board = new TrioGrid(exercise.source, exercise.board.givens, exercise.board.relations)
  const deduction = deduceTrio(board, board.givens)
  if (!deduction || !Number.isInteger(exercise.prefix) || exercise.prefix < 0 || exercise.prefix > deduction.steps.length) throw Error('Invalid Trio lesson prefix')
  const masks = board.givens.map(value => value ? 1 << (value - 1) : 7)
  for (const step of deduction.steps.slice(0, exercise.prefix)) {
    if (masks[step.cell] !== step.before) throw Error('Trio lesson prefix differs from its trace')
    masks[step.cell] = step.after
  }
  const remove = exercise.goal.remove
  if (remove !== 1 && remove !== 2 && remove !== 3) throw Error('Invalid Trio lesson goal symbol')
  const goal: { line: number; remove: 1 | 2 | 3 } = { line: exercise.goal.line, remove }
  const line = TRIO_LINES[exercise.goal.line], bit = 1 << (remove - 1)
  if (!line) throw Error('Invalid Trio lesson goal line')
  const cells: TrioValue[] = masks.map(mask => {
    const value = single(mask) ? Math.log2(mask) + 1 : 0
    if (!isTrioValue(value)) throw Error('Invalid Trio lesson candidates')
    return value
  })
  const game: TrioGame = { cells, notes: masks.map(mask => single(mask) ? 0 : mask) }
  const accepted = line.filter(cell => !single(masks[cell]!) && (masks[cell]! & bit) && !(deduction.candidates[cell]! & bit))
  const targets = exercise.examples.map(example => example.cell)
  if (!equal([...accepted].sort((a, b) => a - b), [...targets].sort((a, b) => a - b)) || !targets.length) throw Error('Trio lesson must include every scoped answer')
  const examples = exercise.examples.map(example => {
    const actions = example.witness
    if (actions.length < 2 || actions.length > 5) throw Error('Invalid Trio lesson witness length')
    const direct = [...TRIO_LINES.map((group, i) => ({ cell: example.cell, remove: bit, rule: i < 9 ? 'row-count' : 'column-count', group })),
      ...windows.map(group => ({ cell: example.cell, remove: bit, rule: 'no-three', group })),
      ...board.relations.map(edge => ({ cell: example.cell, remove: bit, rule: edge.kind, group: [edge.first, edge.second] }))]
    if (direct.some(action => ruleOptions(board, masks, action).some(option => !(bit & option.allowed)))) throw Error('Trio lesson has a direct-rule shortcut')
    const replay = replayWitness(board, masks, actions), final = actions.at(-1)!
    if (replay.masks[example.cell]! & bit || final.cell !== example.cell || !(final.remove & bit)) throw Error('Trio lesson witness misses its goal')
    for (let omitted = 0; omitted < actions.length - 1; omitted++) {
      const alternate = [...masks]
      actions.forEach((action, i) => {
        if (i !== omitted && ruleOptions(board, alternate, action).some(option => !(action.remove & option.allowed))) alternate[action.cell] = alternate[action.cell]! & ~action.remove
      })
      if (!(alternate[example.cell]! & bit)) throw Error('Trio lesson witness contains an unnecessary restriction')
    }
    const rules = new Set(actions.map(action => action.rule))
    if (techniqueId === 'quota-no-three' && (!rules.has('no-three') || ![...rules].some(rule => rule === 'row-count' || rule === 'column-count') || rules.has('same') || rules.has('different'))) throw Error('Trio quota lesson must combine quota and no-three')
    if (techniqueId === 'relation-propagation' && final.rule !== 'same' && final.rule !== 'different') throw Error('Trio relation lesson must cross a link')
    const candidates = masks[example.cell]! & ~bit
    if (replay.masks[example.cell] !== candidates) throw Error('Trio lesson final effect differs from its response')
    if (techniqueId === 'candidate-chains' && (actions.length < 3 || new Set(actions.map(action => `${action.rule}:${action.group.join()}`)).size < 2 || bits.filter(b => candidates & b).length !== 2)) throw Error('Trio candidate chain must leave the advertised pair')
    const hint: TrioHint = { cell: example.cell, candidates, source: game, steps: replay.steps }
    return { cell: example.cell, candidates, proven: deduction.candidates[example.cell]!, reasons: replay.steps.map(step => step.reason), hint }
  })
  return { id: exercise.id, source: exercise.source, board, game, goal, examples, exerciseNumber: index + 1,
    guidance: index === 0 ? 'guided' : 'practice', scope: `${exercise.goal.line < 9 ? 'row' : 'column'} ${exercise.goal.line % 9 + 1}` }
}

export const TRIO_TECHNIQUES = catalog.map(technique => ({ id: technique.id, title: technique.title, stage: technique.stage,
  introduction: technique.introduction, exercises: technique.exercises.map((exercise, index) => prepareTrioExercise(exercise, index, technique.id)) }))
export const TRIO_LESSONS = TRIO_TECHNIQUES.flatMap(technique => technique.exercises)
export type TrioLesson = typeof TRIO_LESSONS[number]
export function checkTrioLessonAnswer(lesson: TrioLesson, answer: { cell: number; candidates: number }): boolean {
  return Number.isInteger(answer.candidates) && answer.candidates > 0 && answer.candidates <= 7 && lesson.examples.some(example =>
    example.cell === answer.cell && (answer.candidates & ~example.candidates) === 0 && (answer.candidates & example.proven) === example.proven)
}

export function applyTrioLessonExample(lesson: TrioLesson, example: TrioLesson['examples'][number], game = lesson.game): TrioGame {
  const cells = [...game.cells], notes = [...game.notes]
  if (single(example.candidates)) {
    const value = Math.log2(example.candidates) + 1
    if (!isTrioValue(value)) throw Error('Invalid Trio lesson result')
    cells[example.cell] = value; notes[example.cell] = 0
  } else { cells[example.cell] = 0; notes[example.cell] = example.candidates }
  return { cells, notes }
}
