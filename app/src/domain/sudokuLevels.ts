/** Daily levels and activation shared with the publisher. */
import { sudoku } from '../../../conformance/id-cases/manifest.json'
import type { SudokuLevel } from './sudoku'

export const SUDOKU_START = sudoku.activationDay
export const SUDOKU_VARIANTS = sudoku.variants as readonly { name: SudokuLevel; suffix: string; label: string }[]
export function sudokuVariantOf(id: string) {
  return SUDOKU_VARIANTS.find(variant => id.endsWith(variant.suffix)) ?? null
}
