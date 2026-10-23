import positions from '../data/sudoku-lessons.json'
import { sudokuSingle, type SudokuBoard, type SudokuGame } from './sudoku'
import { nextSudokuStep, type SudokuStep } from './sudokuHints'

export interface SudokuLesson {
  id: string; title: string; introduction: string; cue: string
  board: SudokuBoard; game: SudokuGame; step: SudokuStep; support: readonly number[]
}

const definitions = [
  {
    id: 'locked-candidates', title: 'Locked candidates', level: 'medium', rule: 'locked-candidate',
    introduction: 'If a row can place a digit only inside one box, that digit cannot appear elsewhere in the box. The same reasoning works for columns, or from a box into a line.',
    cue: 'Look for a digit confined to the two dashed cells in row 1. Which box must contain it?',
  },
  {
    id: 'pairs', title: 'Naked pairs', level: 'medium', rule: 'naked-pair',
    introduction: 'When two cells in a row, column or box have the same two candidates, those two digits belong in those cells. Other cells in that group can exclude both digits.',
    cue: 'Compare the notes in the two dashed cells in row 4. Together, which digits do they reserve?',
  },
  {
    id: 'x-wing', title: 'X-wing', level: 'hard', rule: 'x-wing',
    introduction: 'If two rows can place a digit only in the same two columns, its two placements must occupy opposite corners of that rectangle. Other cells in those columns can exclude that digit. Rows and columns can swap roles.',
    cue: 'Find the digit confined to the four dashed corners in rows 6 and 9. Follow their columns to the target.',
  },
] as const

/** Stop at a real deduction, preserving the accurate notes established before it. */
export const SUDOKU_LESSONS: readonly SudokuLesson[] = definitions.map(definition => {
  const masks = positions[definition.id].map(value => value ? 1 << (value - 1) : 511)
  let step: SudokuStep | null
  while ((step = nextSudokuStep(masks, definition.level)) !== null) {
    if (step.rule === definition.rule) {
      const cells = masks.map(mask => sudokuSingle(mask) ? Math.log2(mask) + 1 : 0)
      const board = { id: `sudoku-lesson-${definition.id}`, level: definition.level, givens: cells }
      const game = { cells, notes: masks.map((mask, cell) => cells[cell] ? 0 : mask) }
      const removed = step.before & ~step.after
      return { ...definition, board, game, step, support: step.group.filter(cell => masks[cell]! & removed) }
    }
    masks[step.cell] = step.after
  }
  throw Error(`Missing teaching deduction: ${definition.id}`)
})
