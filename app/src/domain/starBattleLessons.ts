import catalog from '../data/star-battle-lessons.json'
import { Board } from './board'
import type { GameState } from './game'
import { firstHint, hintCellName } from './hints'

type Descriptor = typeof catalog[number]['exercises'][number]
type FrozenGroup = Descriptor['witness']['sources'][number]

export function starLessonGroupCells(board: Board, group: FrozenGroup): number[] {
  if (group.kind === 'region') return board.cellsOfRegion(group.index)
  if (group.kind === 'row') return Array.from({ length: board.size }, (_, column) => group.index * board.size + column)
  if (group.kind === 'column') return Array.from({ length: board.size }, (_, row) => row * board.size + group.index)
  throw Error(`Unknown lesson group: ${group.kind}`)
}

export function starLessonGroupName(board: Board, group: FrozenGroup): string {
  if (group.kind !== 'region') return `${group.kind} ${group.index + 1}`
  const first = starLessonGroupCells(board, group)[0]
  if (first === undefined) throw Error('Empty lesson region')
  return `region containing ${hintCellName(board, first)}`
}

export function prepareStarBattleExercise(exercise: Descriptor, index: number) {
  const board = new Board(exercise.board.size, exercise.board.regions, exercise.board.regionCapacity, 'star-battle')
  const game: GameState = { board, queens: new Set(exercise.queens), marks: new Set(exercise.marks) }
  const hint = firstHint(board, game.queens, game.marks)
  if (!hint || hint.cell !== exercise.expected.cell || hint.action !== exercise.expected.action || hint.rule !== exercise.expected.rule) {
    throw Error(`Star Battle lesson target differs from its certificate: ${exercise.id}`)
  }
  const groups = [...exercise.witness.sources, ...exercise.witness.homes]
  const witnessCells = groups.flatMap(group => starLessonGroupCells(board, group)).filter(cell => cell !== hint.cell)
  if (hint.support.includes(hint.cell) || witnessCells.some(cell => !hint.support.includes(cell))) {
    throw Error(`Star Battle lesson support differs from its witness: ${exercise.id}`)
  }
  const sourceNeed = exercise.witness.sources.reduce((sum, group) => sum + group.need, 0)
  const homeNeed = exercise.witness.homes.reduce((sum, group) => sum + group.need, 0)
  const sourceNames = exercise.witness.sources.map(group => starLessonGroupName(board, group)).join(' and ')
  const homeNames = exercise.witness.homes.map(group => starLessonGroupName(board, group)).join(' and ')
  const subject = sourceNames.charAt(0).toUpperCase() + sourceNames.slice(1)
  const demand = `${subject} ${exercise.witness.sources.length === 1 ? 'needs' : 'need'} ${sourceNeed} more ${sourceNeed === 1 ? 'star' : 'stars'}.`
  const explanation = exercise.witness.homes.length
    ? `${demand} All available spaces in ${exercise.witness.sources.length === 1 ? 'this group' : 'these groups'} lie in ${homeNames}, with room for exactly ${homeNeed} more stars in total. That capacity is reserved, so ${hintCellName(board, hint.cell)} outside ${exercise.witness.sources.length === 1 ? 'the group' : 'these groups'} must be marked X.`
    : sourceNeed === 1 ? `${demand} The only available space is ${hintCellName(board, hint.cell)}, so it must hold a star.`
      : `${demand} Exactly ${sourceNeed} spaces are available, so every one must hold a star, including ${hintCellName(board, hint.cell)}.`
  return { ...exercise, board, game, hint, sourceNeed, homeNeed, homeNames, explanation, exerciseNumber: index + 1,
    guidance: index === 0 ? 'guided' : 'practice' }
}

export const STAR_BATTLE_TECHNIQUES = catalog.map(technique => ({
  ...technique,
  exercises: technique.exercises.map((exercise, index) => prepareStarBattleExercise(exercise, index)),
}))
export const STAR_BATTLE_LESSONS = STAR_BATTLE_TECHNIQUES.flatMap(technique => technique.exercises)
export type StarBattleLesson = typeof STAR_BATTLE_LESSONS[number]
