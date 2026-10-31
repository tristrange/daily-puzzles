/** The preview classifier's logical rules; notes never prove deductions. */
import { editSudoku, isSudokuSolved, solveSudoku, SUDOKU_COLUMNS, SUDOKU_PEERS, SUDOKU_ROWS, SUDOKU_UNITS,
  sudokuDigits, sudokuSingle, type SudokuBoard, type SudokuGame, type SudokuLevel, type SudokuSolution } from './sudoku'

export interface SudokuStep { cell: number; before: number; after: number; rule: string; group: readonly number[]; dependencies: readonly number[]; reason: string }
export interface SudokuHint { cell: number; candidates: number; source: SudokuGame; reasons: readonly string[]; supportingReasons?: readonly string[]; support: readonly number[]; correction?: boolean }
export type SudokuHintResult = { kind: 'hint'; hint: SudokuHint } | { kind: 'mistake'; cell: number } | { kind: 'none' | 'unverified' | 'contradiction' }
export type SudokuEntryCheck = { kind: 'correct' } | { kind: 'unverified' } | { kind: 'mistake'; cell: number }
export class SudokuContradictionError extends Error {}
const count = (mask: number) => sudokuDigits(mask).length
const cellLabel = (cell: number) => `R${Math.floor(cell / 9) + 1}C${cell % 9 + 1}`
const unitName = (unit: readonly number[]) => {
  const index = SUDOKU_UNITS.findIndex(other => other.length === unit.length && other.every((cell, i) => unit[i] === cell))
  return index < 9 ? `Row ${index + 1}` : index < 18 ? `Column ${index - 8}` : `Box ${index - 17}`
}
function* combinations<T>(items: readonly T[], size: number, start = 0, chosen: T[] = []): Generator<T[]> {
  if (chosen.length === size) { yield chosen; return }
  for (let i = start; i <= items.length - (size - chosen.length); i++) yield* combinations(items, size, i + 1, [...chosen, items[i]!])
}

export function nextSudokuStep(masks: readonly number[], level: SudokuLevel): SudokuStep | null {
  if (masks.length !== 81 || masks.some(mask => !Number.isInteger(mask) || mask <= 0 || mask > 511)) throw new SudokuContradictionError('A cell has no candidates')
  for (const unit of SUDOKU_UNITS) {
    const fixed = unit.map(i => masks[i]!).filter(sudokuSingle)
    if (new Set(fixed).size !== fixed.length || Array.from({ length: 9 }, (_, i) => 1 << i).some(bit => !unit.some(cell => masks[cell]! & bit))) throw new SudokuContradictionError('A unit cannot contain every digit once')
  }
  const restrict = (cell: number, allowed: number, rule: string, group: readonly number[], premise: string): SudokuStep | null => {
    const before = masks[cell]!, after = before & allowed
    if (!after) throw new SudokuContradictionError('A cell has no candidates')
    if (after === before) return null
    const conclusion = `${cellLabel(cell)}: only ${sudokuDigits(after).join(', ')} ${sudokuSingle(after) ? 'remains' : 'remain'}.`
    return { cell, before, after, rule, group, dependencies: [], reason: `${premise} ${conclusion}` }
  }
  for (const [cell, mask] of masks.entries()) if (!sudokuSingle(mask)) {
    const fixed = SUDOKU_PEERS[cell]!.filter(i => sudokuSingle(masks[i]!))
    const used = fixed.reduce((all, i) => all | masks[i]!, 0)
    const step = restrict(cell, 511 ^ used, sudokuSingle(mask & ~used) ? 'naked-single' : 'peer', fixed,
      'Digits already placed in this row, column or box are excluded.')
    if (step) return step
  }
  for (const unit of SUDOKU_UNITS) for (let digit = 0; digit < 9; digit++) {
    const bit = 1 << digit, places = unit.filter(i => masks[i]! & bit)
    if (places.length === 1) {
      const step = restrict(places[0]!, bit, 'hidden-single', unit, `${unitName(unit)} has only one possible position for ${digit + 1}.`)
      if (step) return step
    }
  }
  if (level === 'easy') return null
  for (const [sourceIndex, source] of SUDOKU_UNITS.entries()) for (let digit = 0; digit < 9; digit++) {
    const bit = 1 << digit, places = source.filter(i => masks[i]! & bit)
    if (places.length < 2) continue
    for (const [destIndex, dest] of SUDOKU_UNITS.entries()) {
      if ((sourceIndex < 18) === (destIndex < 18) || !places.every(i => dest.includes(i))) continue
      for (const cell of dest) if (!source.includes(cell)) {
        const step = restrict(cell, 511 ^ bit, 'locked-candidate', source,
          `${unitName(source)} can place ${digit + 1} only at ${places.map(cellLabel).join(', ')}. All are in ${unitName(dest).toLowerCase()}, so ${digit + 1} cannot appear elsewhere in it.`)
        if (step) return step
      }
    }
  }
  for (let size = 2; size <= (level === 'hard' ? 3 : 2); size++) for (const unit of SUDOKU_UNITS) {
    const name = size === 2 ? 'pair' : 'triple'
    const open = unit.filter(i => count(masks[i]!) > 1 && count(masks[i]!) <= size)
    for (const selected of combinations(open, size)) {
      const union = selected.reduce((mask, cell) => mask | masks[cell]!, 0)
      if (count(union) !== size) continue
      for (const cell of unit) if (!selected.includes(cell)) {
        const step = restrict(cell, 511 ^ union, `naked-${name}`, selected,
          `${selected.map(cellLabel).join(', ')} in ${unitName(unit).toLowerCase()} can contain only ${sudokuDigits(union).join(', ')}. Those digits must stay in these cells.`)
        if (step) return step
      }
    }
    for (const digits of combinations([0, 1, 2, 3, 4, 5, 6, 7, 8], size)) {
      const allowed = digits.reduce((mask, digit) => mask | (1 << digit), 0), places = unit.filter(i => masks[i]! & allowed)
      if (places.length !== size) continue
      for (const cell of places) {
        const step = restrict(cell, allowed, `hidden-${name}`, unit,
          `${unitName(unit)} can place ${sudokuDigits(allowed).join(', ')} only at ${places.map(cellLabel).join(', ')}. These ${size} cells must hold those digits.`)
        if (step) return step
      }
    }
  }
  if (level === 'hard') for (const lines of [SUDOKU_ROWS, SUDOKU_COLUMNS]) for (let digit = 0; digit < 9; digit++) {
    const bit = 1 << digit
    const eligible = lines.map(line => ({ line, offsets: line.flatMap((cell, offset) => masks[cell]! & bit ? [offset] : []) }))
    for (const [first, second] of combinations(eligible, 2)) {
      if (!first || !second || first.offsets.length !== 2 || first.offsets.some((offset, i) => second.offsets[i] !== offset) || second.offsets.length !== 2) continue
      for (const line of lines) if (line !== first.line && line !== second.line) for (const offset of first.offsets) {
        const step = restrict(line[offset]!, 511 ^ bit, 'x-wing', [...first.line, ...second.line],
          `${unitName(first.line)} and ${unitName(second.line).toLowerCase()} can place ${digit + 1} only in matching positions ${first.offsets.map(i => i + 1).join(' and ')}. This X-wing reserves both crossing lines for these two placements.`)
        if (step) return step
      }
    }
  }
  return null
}

export function deduceSudoku(board: SudokuBoard, cells: readonly number[], level: SudokuLevel = board.level) {
  const masks = cells.map(value => value ? 1 << (value - 1) : 511), latest = Array<number>(81).fill(-1), steps: SudokuStep[] = []
  let step: SudokuStep | null
  while ((step = nextSudokuStep(masks, level)) !== null) {
    const dependencies = [...new Set([...step.group, step.cell].map(i => latest[i]!).filter(i => i >= 0))].sort((a, b) => a - b)
    steps.push({ ...step, dependencies }); latest[step.cell] = steps.length - 1; masks[step.cell] = step.after
  }
  const result = masks.map(mask => sudokuSingle(mask) ? Math.log2(mask) + 1 : 0)
  return { cells: result, candidates: masks, steps, solved: isSudokuSolved(board, result) }
}

const solutions = new WeakMap<SudokuBoard, SudokuSolution>()
export function checkEntriesAgainstSolution(solution: SudokuSolution, cells: readonly number[]): SudokuEntryCheck {
  if (solution.kind !== 'unique') return { kind: 'unverified' }
  const wrong = cells.findIndex((value, cell) => value !== 0 && value !== solution.cells[cell])
  return wrong < 0 ? { kind: 'correct' } : { kind: 'mistake', cell: wrong }
}

export function checkSudokuEntries(board: SudokuBoard, game: SudokuGame): SudokuEntryCheck {
  let verified = solutions.get(board)
  if (!verified) { verified = solveSudoku(board); solutions.set(board, verified) }
  return checkEntriesAgainstSolution(verified, game.cells)
}

export function findSudokuHint(board: SudokuBoard, game: SudokuGame): SudokuHintResult {
  const check = checkSudokuEntries(board, game)
  if (check.kind !== 'correct') return check
  try {
    const { steps } = deduceSudoku(board, game.cells)
    const index = steps.findIndex(step => game.cells[step.cell] === 0 && (sudokuSingle(step.after) || game.notes[step.cell] === 0 || (game.notes[step.cell]! & ~step.after) !== 0))
    if (index < 0) return { kind: 'none' }
    const included = new Set<number>()
    const include = (i: number) => { if (included.has(i)) return; included.add(i); steps[i]!.dependencies.forEach(include) }
    include(index)
    const chain = [...included].sort((a, b) => a - b).map(i => steps[i]!)
    const supportingReasons: string[] = [], peerChecks: string[] = []
    const flushPeers = () => {
      if (peerChecks.length) supportingReasons.push(`Row/column/box checks exclude placed digits, leaving ${peerChecks.join('; ')}.`)
      peerChecks.length = 0
    }
    for (const step of chain.slice(0, -1)) {
      if (step.rule === 'peer' || step.rule === 'naked-single') peerChecks.push(`${cellLabel(step.cell)}: ${sudokuDigits(step.after).join(', ')}`)
      else { flushPeers(); supportingReasons.push(step.reason) }
    }
    flushPeers()
    return { kind: 'hint', hint: { cell: steps[index]!.cell, candidates: steps[index]!.after, source: game,
      reasons: [steps[index]!.reason], supportingReasons, support: [...new Set(chain.flatMap(step => [...step.group, step.cell]))] } }
  } catch (error) { if (error instanceof SudokuContradictionError) return { kind: 'contradiction' }; throw error }
}

export function applySudokuHint(board: SudokuBoard, game: SudokuGame, hint: SudokuHint): SudokuGame {
  if (game !== hint.source || board.givens[hint.cell] !== 0) return game
  if (hint.correction) return editSudoku(board, game, hint.cell, 0)
  if (sudokuSingle(hint.candidates)) return editSudoku(board, game, hint.cell, Math.log2(hint.candidates) + 1)
  const notes = [...game.notes]; notes[hint.cell] = hint.candidates
  return { ...game, notes }
}
