import positions from '../data/sudoku-advanced-lessons.json'
import { SUDOKU_COLUMNS, SUDOKU_ROWS, sudokuDigits, sudokuSingle } from './sudoku'
import { nextSudokuStep, type SudokuStep } from './sudokuHints'
import type { SudokuLesson } from './sudokuLessons'

const label = (cell: number) => `R${Math.floor(cell / 9) + 1}C${cell % 9 + 1}`
const candidates = (mask: number) => sudokuDigits(mask).join(', ')

const definitions = {
  'xy-wing': {
    id: 'xy-wing', title: 'XY-Wing', level: 'hard',
    introduction: 'An XY-Wing has a two-candidate pivot and two wings that each see the pivot. Each wing shares one pivot digit and a third digit with the other wing. Whichever value the pivot takes, one wing must contain that third digit.',
    cue: 'Find the pivot and two wings. A cell that sees both wings cannot contain their shared third digit.',
  },
  swordfish: {
    id: 'swordfish', title: 'Swordfish', level: 'hard',
    introduction: 'Swordfish extends X-Wing to three lines. If a digit in three rows is confined to the same three columns, those placements occupy all three columns. The same logic works with rows and columns exchanged.',
    cue: 'Find the three source lines and the three crossing lines that contain all their candidates for one digit.',
  },
} as const

function prepare(
  definition: typeof definitions[keyof typeof definitions],
  exercise: { id: string; givens: number[]; stepNo: number; digit: number; cell: number },
  index: number,
  pattern: (masks: readonly number[]) => { support: number[]; reason: string },
): SudokuLesson {
  const masks = exercise.givens.map(value => value ? 1 << (value - 1) : 511)
  for (let i = 0; i < exercise.stepNo; i++) {
    const step = nextSudokuStep(masks, 'hard')
    if (!step) throw Error(`Incomplete lesson preparation: ${exercise.id}`)
    masks[step.cell] = step.after
  }
  const { support, reason } = pattern(masks)
  const before = masks[exercise.cell]!, after = before & ~(1 << (exercise.digit - 1))
  if (!after || before === after) throw Error(`Invalid lesson elimination: ${exercise.id}`)
  const step: SudokuStep = { cell: exercise.cell, before, after, rule: definition.id, group: support, dependencies: [], reason }
  const cells = masks.map(mask => sudokuSingle(mask) ? Math.log2(mask) + 1 : 0)
  return { ...definition, id: exercise.id, techniqueId: definition.id, exerciseNumber: index + 1,
    guidance: index === 0 ? 'guided' : 'practice', board: { id: `sudoku-lesson-${exercise.id}`, level: 'hard', givens: cells },
    game: { cells, notes: masks.map((mask, cell) => cells[cell] ? 0 : mask) }, step, support }
}

export const SUDOKU_ADVANCED_TECHNIQUES = [
  { ...definitions['xy-wing'], exercises: positions['xy-wing'].map((exercise, index) => prepare(definitions['xy-wing'], exercise, index, masks => {
    const [first, second] = exercise.wings as [number, number]
    const support = [exercise.pivot, first, second]
    return { support, reason: `${label(exercise.pivot)} is the pivot with ${candidates(masks[exercise.pivot]!)}. It sees ${label(first)} (${candidates(masks[first]!)}) and ${label(second)} (${candidates(masks[second]!)}). Whichever pivot digit is placed, one wing must be ${exercise.digit}. ${label(exercise.cell)} sees both wings, so it cannot be ${exercise.digit}.` }
  })) },
  { ...definitions.swordfish, exercises: positions.swordfish.map((exercise, index) => prepare(definitions.swordfish, exercise, index, masks => {
    const sources = exercise.axis === 'row' ? SUDOKU_ROWS : SUDOKU_COLUMNS
    const sourceName = exercise.axis === 'row' ? 'Rows' : 'Columns'
    const crossingName = exercise.axis === 'row' ? 'columns' : 'rows'
    const bit = 1 << (exercise.digit - 1)
    const support = exercise.lines.flatMap(line => sources[line]!.filter(cell => (masks[cell]! & bit) !== 0))
    return { support, reason: `${sourceName} ${exercise.lines.map(line => line + 1).join(', ')} can place ${exercise.digit} only in ${crossingName} ${exercise.offsets.map(offset => offset + 1).join(', ')}. Their three ${exercise.digit}s must occupy those three ${crossingName}, so ${label(exercise.cell)} cannot be ${exercise.digit}.` }
  })) },
] as const
