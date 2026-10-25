import positions from '../data/sudoku-lessons.json'
import { sudokuSingle, type SudokuBoard, type SudokuGame } from './sudoku'
import { nextSudokuStep, type SudokuStep } from './sudokuHints'

export interface SudokuLesson {
  id: string; title: string; introduction: string; cue: string
  techniqueId: string; exerciseNumber: number; guidance: 'guided' | 'practice'
  board: SudokuBoard; game: SudokuGame; step: SudokuStep; support: readonly number[]
}

const definitions = [
  {
    id: 'locked-candidates', title: 'Locked candidates', level: 'medium', rule: 'locked-candidate', supportPolicy: 'removed',
    introduction: 'If a row can place a digit only inside one box, that digit cannot appear elsewhere in the box. The same reasoning works for columns, or from a box into a line.',
  },
  {
    id: 'pairs', title: 'Naked pairs', level: 'medium', rule: 'naked-pair', supportPolicy: 'group',
    introduction: 'When two cells in a row, column or box have the same two candidates, those two digits belong in those cells. Other cells in that group can exclude both digits.',
  },
  {
    id: 'hidden-pairs', title: 'Hidden pairs', level: 'medium', rule: 'hidden-pair', supportPolicy: 'retained',
    introduction: 'A naked pair starts with two cells that share the same two candidates. A hidden pair starts with two digits that can go only in the same two cells of a row, column or box. Those cells can exclude their other candidates.',
  },
  {
    id: 'naked-triples', title: 'Naked triples', level: 'hard', rule: 'naked-triple', supportPolicy: 'group',
    introduction: 'A naked triple extends a naked pair to three cells. If their combined candidates contain just three digits, those digits belong in those cells. Each cell can have a different pair or all three digits. Other cells in the group can exclude them.',
  },
  {
    id: 'x-wing', title: 'X-wing', level: 'hard', rule: 'x-wing', supportPolicy: 'removed',
    introduction: 'If two rows can place a digit only in the same two columns, its two placements must occupy opposite corners of that rectangle. Other cells in those columns can exclude that digit. Rows and columns can swap roles.',
  },
] as const

function prepareExercise(definition: typeof definitions[number], exercise: typeof positions[typeof definition.id][number], index: number): SudokuLesson {
  const masks = exercise.givens.map(value => value ? 1 << (value - 1) : 511)
  let step: SudokuStep | null
  while ((step = nextSudokuStep(masks, definition.level)) !== null) {
    if (step.rule === definition.rule) {
      const cells = masks.map(mask => sudokuSingle(mask) ? Math.log2(mask) + 1 : 0)
      const board = { id: `sudoku-lesson-${exercise.id}`, level: definition.level, givens: cells }
      const game = { cells, notes: masks.map((mask, cell) => cells[cell] ? 0 : mask) }
      const relevant = definition.supportPolicy === 'retained' ? step.after : step.before & ~step.after
      const support = step.group.filter(cell => definition.supportPolicy === 'group' || (masks[cell]! & relevant) !== 0)
      return { ...definition, ...exercise, techniqueId: definition.id, exerciseNumber: index + 1,
        guidance: index === 0 ? 'guided' : 'practice', board, game, step, support }
    }
    masks[step.cell] = step.after
  }
  throw Error(`Missing teaching deduction: ${exercise.id}`)
}

export const SUDOKU_TECHNIQUES = definitions.map(definition => ({
  ...definition,
  exercises: positions[definition.id].map((exercise, index) => prepareExercise(definition, exercise, index)),
}))

export const SUDOKU_LESSONS: readonly SudokuLesson[] = SUDOKU_TECHNIQUES.flatMap(technique => technique.exercises)
