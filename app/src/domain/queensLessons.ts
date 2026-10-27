import catalog from '../data/queens-lessons.json'
import { Board } from './board'
import type { GameState } from './game'

export const QUEENS_TECHNIQUES = [
  { id: 'pair', title: 'Reserve lines with two regions', intro: 'Two regions may need their queens in the same two rows or columns. Those lines are then reserved for the two regions.' },
  { id: 'chain', title: 'Turn a reservation into a queen', intro: 'Use a two-region reservation to eliminate spaces, then check whether a row has only one possible queen left.' },
  { id: 'squeeze', title: 'Combine reservations with no-touch', intro: 'Compare the possible queen pairs in two reserved regions. A cell touched by a queen in every pair cannot hold another queen.' },
] as const

export const QUEENS_LESSONS = catalog.map((item, index) => {
  const board = new Board(item.board.size, item.board.regions, Array<number>(item.board.size).fill(1), 'queens')
  const game: GameState = { board, queens: new Set(item.queens), marks: new Set(item.marks) }
  return { ...item, board, game, exerciseNumber: index % 3 + 1, guidance: index % 3 === 0 ? 'guided' : 'practice' }
})
