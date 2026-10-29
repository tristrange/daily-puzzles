import raw from '../data/killer-forty-five-lessons.json'
import { killerCombinations, parseKillerPreviews, type KillerSudokuBoard } from './killerSudoku'
import { SUDOKU_BOXES, SUDOKU_COLUMNS, SUDOKU_ROWS, sudokuDigits } from './sudoku'

type Unit = { readonly kind: 'row' | 'column' | 'box'; readonly index: number }
export type KillerFortyFiveLesson = {
  readonly id: string
  readonly board: KillerSudokuBoard
  readonly cageIndex: number
  readonly unit: Unit
  readonly side: 'innie' | 'outie'
  readonly prompt: string
  readonly cue: string
  readonly explanation: string
}

const [first, second, third, fourth] = parseKillerPreviews(raw, true)
if (!first || !second || !third || !fourth) throw Error('Expected four 45-rule boards')

export const KILLER_FORTY_FIVE_LESSONS: readonly KillerFortyFiveLesson[] = [
  { id: 'rule-of-45-1', board: first, cageIndex: 8, unit: { kind: 'box', index: 4 }, side: 'innie',
    prompt: 'In box 5, cross out combinations of the 26 cage that cannot fit its two cells inside the box.',
    cue: 'Box 5 totals 45. The 18 and 16 cages are entirely inside it. What is left for the two crossing cells?',
    explanation: 'The two complete cages total 18 + 16 = 34. The two cells inside box 5 must therefore total 45 − 34 = 11. The 26 cage has two other cells, which must total 15. The combination 4 + 5 + 8 + 9 has no pair totaling 11, so cross it out. For example, 2 + 7 + 8 + 9 can split into 2 + 9 and 7 + 8.' },
  { id: 'rule-of-45-2', board: second, cageIndex: 17, unit: { kind: 'column', index: 0 }, side: 'innie',
    prompt: 'Use column 1 to cross out combinations of the crossing 23 cage that cannot fit its two cells inside the column.',
    cue: 'Column 1 totals 45. Add the cages entirely inside the column and compare their total with 45.',
    explanation: 'The complete cages in column 1 total 11 + 3 + 16 = 30, leaving 15 for the two crossing cells. The other two cells of the 23 cage total 8. For example, 1 + 5 + 8 + 9 has no pair totaling 15, while 1 + 6 + 7 + 9 can split into 6 + 9 and 1 + 7.' },
  { id: 'rule-of-45-3', board: third, cageIndex: 18, unit: { kind: 'box', index: 7 }, side: 'outie',
    prompt: 'Use box 8 to cross out combinations of the crossing 22 cage that cannot fit its two cells outside the box.',
    cue: 'Add the totals of all cages touching box 8. Anything above 45 belongs to the cells outside the box.',
    explanation: 'The cages touching box 8 total 10 + 5 + 19 + 22 = 56. Box 8 accounts for 45, so the two outside cells total 11. The other two cells in the 22 cage also total 11. For example, 1 + 4 + 8 + 9 cannot make a pair totaling 11; 2 + 3 + 8 + 9 can split into 2 + 9 and 3 + 8.' },
  { id: 'rule-of-45-4', board: fourth, cageIndex: 21, unit: { kind: 'row', index: 8 }, side: 'outie',
    prompt: 'Use row 9 to cross out combinations of the crossing 26 cage that cannot fit its three cells outside the row.',
    cue: 'Add the totals of the cages touching row 9. Compare the result with 45 to find the outside cells’ total.',
    explanation: 'The cages touching row 9 total 16 + 17 + 26 = 59. The three outside cells must therefore total 59 − 45 = 14, leaving 12 for the two cells inside the row. The combination 1 + 2 + 6 + 8 + 9 cannot make a three-digit total of 14. In 1 + 3 + 5 + 8 + 9, the outside cells could be 1 + 5 + 8, leaving 3 + 9 inside.' },
]

/** The selected subtotal follows from complete cage sums and the unit's total of 45. */
export function fortyFiveFacts(lesson: KillerFortyFiveLesson) {
  const { board, unit } = lesson, cage = board.cages[lesson.cageIndex]
  const cells = (unit.kind === 'row' ? SUDOKU_ROWS : unit.kind === 'column' ? SUDOKU_COLUMNS : SUDOKU_BOXES)[unit.index]
  if (!cage || !cells) throw Error('Invalid 45-rule lesson')
  const within = new Set(cells)
  const touching = board.cages.filter(item => item.cells.some(cell => within.has(cell)))
  const inside = cage.cells.filter(cell => within.has(cell)), outside = cage.cells.filter(cell => !within.has(cell))
  const insideTotal = 45 - touching.filter(item => item.cells.every(cell => within.has(cell))).reduce((sum, item) => sum + item.sum, 0)
  const outsideTotal = touching.reduce((sum, item) => sum + item.sum, 0) - 45
  return { cage, unitCells: cells, inside, outside,
    targetCells: lesson.side === 'innie' ? inside : outside,
    targetTotal: lesson.side === 'innie' ? insideTotal : outsideTotal }
}

function containsSubtotal(mask: number, count: number, total: number): boolean {
  for (let subset = mask; subset > 0; subset = (subset - 1) & mask) {
    const digits = sudokuDigits(subset)
    if (digits.length === count && digits.reduce((sum, digit) => sum + digit, 0) === total) return true
  }
  return false
}

/** Exclude only combinations that cannot make the subtotal, not deductions from other rules. */
export function fortyFiveExcluded(lesson: KillerFortyFiveLesson): readonly number[] {
  const { cage, targetCells, targetTotal } = fortyFiveFacts(lesson)
  return killerCombinations(cage).filter(mask => !containsSubtotal(mask, targetCells.length, targetTotal))
}
