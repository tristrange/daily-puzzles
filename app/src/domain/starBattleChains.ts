import catalog from '../data/star-battle-chains.json'
import { Board } from './board'
import type { GameState } from './game'
import { hintCellName } from './hints'
import { starLessonGroupCells, starLessonGroupName } from './starBattleLessons'

export const STAR_BATTLE_CHAINS = catalog.map((exercise, index) => {
  const board = new Board(exercise.board.size, exercise.board.regions, exercise.board.regionCapacity, 'star-battle')
  const game: GameState = { board, queens: new Set(exercise.queens), marks: new Set(exercise.marks) }
  const sources = exercise.witness.sources.map(group => starLessonGroupName(board, group)).join(' and ')
  const homes = exercise.witness.homes.map(group => starLessonGroupName(board, group)).join(' and ')
  const demand = exercise.witness.sources.reduce((sum, group) => sum + group.need, 0)
  const capacity = exercise.witness.homes.reduce((sum, group) => sum + group.need, 0)
  const group = starLessonGroupName(board, exercise.group)
  const support = [...new Set([...exercise.witness.sources, ...exercise.witness.homes, exercise.group]
    .flatMap(part => starLessonGroupCells(board, part)))]
  const reasons = [
    `${sources.charAt(0).toUpperCase() + sources.slice(1)} ${exercise.witness.sources.length === 1 ? 'needs' : 'need'} ${demand} more ${demand === 1 ? 'star' : 'stars'}. The available spaces are in ${homes}, which ${exercise.witness.homes.length === 1 ? 'has' : 'have'} room for ${capacity}. That capacity is reserved, so ${hintCellName(board, exercise.first.cell)} cannot contain a star.`,
    exercise.group.need === 1
      ? `${group.charAt(0).toUpperCase() + group.slice(1)} still needs one star. After that exclusion, only ${hintCellName(board, exercise.answers[0]!)} remains, so it must hold a star.`
      : `${group.charAt(0).toUpperCase() + group.slice(1)} still needs two stars. After that exclusion, only ${exercise.answers.map(cell => hintCellName(board, cell)).join(' and ')} remain, so both must hold a star.`,
  ]
  return { ...exercise, board, game, support, reasons, groupName: group, exerciseNumber: index + 1, guidance: index === 0 ? 'guided' : 'practice' }
})
