/** Daily levels and activation shared with the publisher. */
import { sudoku, killerSudoku } from '../../../conformance/id-cases/manifest.json'
import type { SudokuLevel } from './sudoku'

export const SUDOKU_START = sudoku.activationDay
export const SUDOKU_VARIANTS = sudoku.variants as readonly { name: SudokuLevel; suffix: string; label: string }[]
export function sudokuVariantOf(id: string) {
  return id.includes('-killer-sudoku-') ? null : SUDOKU_VARIANTS.find(variant => id.endsWith(variant.suffix)) ?? null
}

export const KILLER_START = killerSudoku.activationDay
export const KILLER_VARIANTS = killerSudoku.variants as readonly { name: SudokuLevel; suffix: string; label: string }[]
export function killerVariantOf(id: string) {
  return KILLER_VARIANTS.find(variant => id.endsWith(variant.suffix)) ?? null
}
