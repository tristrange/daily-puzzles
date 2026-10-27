import catalog from '../data/tents-nurikabe-lessons.json'
import { isNurikabeGame, type NurikabeBoard, type NurikabeGame } from './nurikabe'
import { isTentsMark, parseTentsBoard, type TentsBoard, type TentsGame } from './tents'

type Answer = { cell: number; support: number[] }
type Common = { id: string; source: string; axis: string; line: number; answers: Answer[]; exerciseNumber: number; guidance: 'guided' | 'practice' }
export type GridLesson = Common & (
  | { kind: 'nurikabe'; board: NurikabeBoard; state: NurikabeGame }
  | { kind: 'tents'; board: TentsBoard; state: TentsGame; reason: string }
)

export const GRID_LESSONS: GridLesson[] = catalog.map((exercise, index) => {
  const common: Common = { id: exercise.id, source: exercise.source, axis: exercise.axis, line: exercise.line,
    answers: exercise.answers, exerciseNumber: index % 3 + 1, guidance: index % 3 === 0 ? 'guided' : 'practice' }
  if (exercise.game === 'nurikabe' && 'clues' in exercise.board && Array.isArray(exercise.board.clues)) {
    const board: NurikabeBoard = { id: exercise.board.id, size: exercise.board.size, clues: exercise.board.clues }
    if (!isNurikabeGame(board, exercise.state)) throw Error(`Invalid lesson state: ${exercise.id}`)
    return { ...common, kind: 'nurikabe', board, state: exercise.state }
  }
  if (exercise.game === 'tents' && typeof exercise.reason === 'string') {
    const board = parseTentsBoard(exercise.board)
    if (exercise.state.length !== board.size ** 2 || !exercise.state.every(isTentsMark)
      || board.trees.some(cell => exercise.state[cell] !== 0)) throw Error(`Invalid lesson state: ${exercise.id}`)
    return { ...common, kind: 'tents', board, state: exercise.state, reason: exercise.reason }
  }
  throw Error(`Unknown lesson: ${exercise.id}`)
})
