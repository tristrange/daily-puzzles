import catalog from '../data/tents-nurikabe-lessons.json'
import advancedTents from '../data/tents-advanced-lessons.json'
import tentsMatching from '../data/tents-matching-lessons.json'
import advancedNurikabe from '../data/nurikabe-advanced-lessons.json'
import tracksLessons from '../data/tracks-lessons.json'
import { isNurikabeGame, type NurikabeBoard, type NurikabeGame } from './nurikabe'
import { isTentsMark, parseTentsBoard, type TentsBoard, type TentsGame } from './tents'
import { TrackGrid } from './tracks'
import { MAYBE, type TracksGame } from './tracksGame'

type Answer = { cell: number; support: number[] }
type Common = { id: string; source: string; axis: string; line: number; exerciseNumber: number; guidance: 'guided' | 'practice'; technique: string; value: 1 | 2 }
export type GridLesson = Common & (
  | { kind: 'nurikabe'; board: NurikabeBoard; state: NurikabeGame; answers: Answer[]; reason?: string; prompt?: string }
  | { kind: 'tents'; board: TentsBoard; state: TentsGame; answers: Answer[]; reason: string; prompt?: string }
  | { kind: 'train-tracks'; board: TrackGrid; state: TracksGame; answers: (Answer & { brush: number })[]; reason: string; prompt: string }
)

export const GRID_TECHNIQUES = {
  nurikabe: [
    { id: 'sea', title: 'Keep the sea connected', intro: 'The sea must form one connected area. Look for a cell that every possible route between two sea areas must cross.' },
    { id: 'island-shapes', title: 'Overlap island shapes', intro: 'Compare all shapes that fit an island’s size and its surroundings. A cell in every shape must be land.' },
    { id: 'connect-land', title: 'Connect isolated land', intro: 'Find which island can reach isolated land, then compare its possible routes to that land.' },
  ],
  tents: [
    { id: 'protect', title: 'Protect a tree’s options', intro: 'A tent cannot touch another tent. Look for a placement that would block every remaining tent position for a tree.' },
    { id: 'line', title: 'Reserve space for trees', intro: 'Trees whose remaining tent positions all lie in one line reserve space in that line.' },
    { id: 'arrangements', title: 'Compare line arrangements', intro: 'List the possible tent arrangements in a row or column. A cell used in every arrangement must contain a tent.' },
    { id: 'matching', title: 'Pair competing trees', intro: 'Several trees can share tent positions. Compare ways to give each tree its own tent without any tents touching.' },
    { id: 'matching-count', title: 'Combine tree pairings and counts', intro: 'Use a row or column limit to rule out tree pairings, then look for a cell decided by the remaining possibilities.' },
  ],
  'train-tracks': [
    { id: 'corridor', title: 'Find a necessary route', intro: 'Two known tracks must belong to one route. Look for cells that every possible connection between them has to use.' },
    { id: 'counts', title: 'Combine counts and connections', intro: 'A full row or column closes its remaining cells. Use that restriction to find where the route must pass.' },
    { id: 'loop', title: 'Avoid closing a loop', intro: 'Two open ends of the same track segment cannot join each other before the route reaches both edge ends.' },
  ],
} as const satisfies Record<GridLesson['kind'], readonly { id: string; title: string; intro: string }[]>

export const GRID_LESSONS: GridLesson[] = catalog.map((exercise, index): GridLesson => {
  const common: Common = { id: exercise.id, source: exercise.source, axis: exercise.axis, line: exercise.line,
    exerciseNumber: index % 3 + 1, guidance: index % 3 === 0 ? 'guided' : 'practice',
    technique: exercise.game === 'nurikabe' ? 'sea' : 'arrangements', value: 1 }
  if (exercise.game === 'nurikabe' && 'clues' in exercise.board && Array.isArray(exercise.board.clues)) {
    const board: NurikabeBoard = { id: exercise.board.id, size: exercise.board.size, clues: exercise.board.clues }
    if (!isNurikabeGame(board, exercise.state)) throw Error(`Invalid lesson state: ${exercise.id}`)
    return { ...common, kind: 'nurikabe', board, state: exercise.state, answers: exercise.answers }
  }
  if (exercise.game === 'tents' && typeof exercise.reason === 'string') {
    const board = parseTentsBoard(exercise.board)
    if (exercise.state.length !== board.size ** 2 || !exercise.state.every(isTentsMark)
      || board.trees.some(cell => exercise.state[cell] !== 0)) throw Error(`Invalid lesson state: ${exercise.id}`)
    return { ...common, kind: 'tents', board, state: exercise.state, answers: exercise.answers, reason: exercise.reason }
  }
  throw Error(`Unknown lesson: ${exercise.id}`)
}).concat(advancedTents.map((exercise, index): GridLesson => {
  const board = parseTentsBoard(exercise.board)
  if (exercise.state.length !== board.size ** 2 || !exercise.state.every(isTentsMark)
    || board.trees.some(cell => exercise.state[cell] !== 0)) throw Error(`Invalid lesson state: ${exercise.id}`)
  return { kind: 'tents', id: exercise.id, source: exercise.source, board, state: exercise.state,
    technique: exercise.technique, value: 2, axis: exercise.axis, line: exercise.line,
    answers: exercise.answers, prompt: exercise.prompt, reason: exercise.reason,
    exerciseNumber: index % 3 + 1, guidance: index % 3 === 0 ? 'guided' : 'practice' }
})).concat(tentsMatching.map((exercise, index): GridLesson => {
  const board = parseTentsBoard(exercise.board)
  if ((exercise.value !== 1 && exercise.value !== 2) || exercise.state.length !== board.size ** 2 || !exercise.state.every(isTentsMark)
    || board.trees.some(cell => exercise.state[cell] !== 0)) throw Error(`Invalid lesson state: ${exercise.id}`)
  return { kind: 'tents', id: exercise.id, source: board.id, board, state: exercise.state,
    technique: exercise.technique, value: exercise.value, axis: exercise.axis, line: exercise.line,
    answers: exercise.answers, prompt: exercise.prompt, reason: exercise.reason,
    exerciseNumber: index % 3 + 1, guidance: index % 3 === 0 ? 'guided' : 'practice' }
})).concat(advancedNurikabe.map((exercise, index): GridLesson => {
  const board: NurikabeBoard = exercise.board
  if (!isNurikabeGame(board, exercise.state)) throw Error(`Invalid lesson state: ${exercise.id}`)
  return { kind: 'nurikabe', id: exercise.id, source: exercise.source, board, state: exercise.state,
    technique: exercise.technique, value: 2, axis: exercise.axis, line: exercise.line,
    answers: exercise.answers, prompt: exercise.prompt, reason: exercise.reason,
    exerciseNumber: index % 3 + 1, guidance: index % 3 === 0 ? 'guided' : 'practice' }
})).concat(tracksLessons.map((exercise, index): GridLesson => {
  const raw = exercise.board
  const board = new TrackGrid(raw.width, raw.height, raw.rowClues, raw.colClues, raw.givens)
  if (exercise.pieces.length !== board.cellCount || exercise.pieces.some((piece, cell) => !Number.isInteger(piece) || piece < 0 || piece > MAYBE || (board.givens[cell] !== 0 && piece !== board.givens[cell]))) throw Error(`Invalid lesson state: ${exercise.id}`)
  return { kind: 'train-tracks', id: exercise.id, source: exercise.source, board, state: { grid: board, pieces: exercise.pieces },
    technique: exercise.technique, value: 1, axis: 'row', line: 0, answers: exercise.answers,
    prompt: exercise.prompt, reason: exercise.reason, exerciseNumber: index % 3 + 1, guidance: index % 3 === 0 ? 'guided' : 'practice' }
}))
