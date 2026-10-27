/** Killer Sudoku preview hints: cage deductions and a bounded uniqueness check. */
import { editKillerSudoku, killerConflicts, type KillerCage, type KillerSudokuBoard } from './killerSudoku'
import { SUDOKU_PEERS, SUDOKU_UNITS, sudokuCellName, sudokuDigit, sudokuDigits, sudokuSingle, type SudokuGame, type SudokuSolution } from './sudoku'
import type { SudokuHint, SudokuHintResult } from './sudokuHints'

const ALL = 511
const boxOf = (cell: number) => Math.floor(cell / 27) * 3 + Math.floor(cell % 9 / 3)
const bitOf = (digit: number) => 1 << (digit - 1)

/** Exhaustive unless it finds two solutions or reaches the node limit. */
export function solveKillerSudoku(board: KillerSudokuBoard, maxNodes = 200_000): SudokuSolution {
  if (!Number.isSafeInteger(maxNodes) || maxNodes < 0) return { kind: 'incomplete' }
  if (board.givens.length !== 81 || !board.givens.every(sudokuDigit) || killerConflicts(board, board.givens).size) return { kind: 'none' }
  const cells = [...board.givens], rows = Array<number>(9).fill(0), columns = [...rows], boxes = [...rows]
  const owners = Array<number>(81).fill(-1), used = Array<number>(board.cages.length).fill(0)
  const choices = board.cages.map((cage, index) => {
    cage.cells.forEach(cell => { owners[cell] = index })
    return Array.from({ length: ALL }, (_, i) => i + 1).filter(mask => {
      const digits = sudokuDigits(mask)
      return digits.length === cage.cells.length && digits.reduce((sum, value) => sum + value, 0) === cage.sum
    })
  })
  if (owners.some(owner => owner < 0)) return { kind: 'none' }
  for (const [cell, value] of cells.entries()) if (value) {
    const bit = bitOf(value), row = Math.floor(cell / 9), column = cell % 9, cage = owners[cell]!
    if ((rows[row]! | columns[column]! | boxes[boxOf(cell)]! | used[cage]!) & bit) return { kind: 'none' }
    rows[row]! |= bit; columns[column]! |= bit; boxes[boxOf(cell)]! |= bit; used[cage]! |= bit
  }
  if (choices.some((sets, cage) => !sets.some(set => (set & used[cage]!) === used[cage]))) return { kind: 'none' }
  let nodes = 0, exhausted = false
  const answers: number[][] = []
  const visit = () => {
    if (nodes >= maxNodes) { exhausted = true; return }
    nodes++
    let target = -1, options = 0, smallest = 10
    for (const [cell, value] of cells.entries()) if (!value) {
      const cage = owners[cell]!, row = Math.floor(cell / 9), column = cell % 9
      let possible = 0
      for (const set of choices[cage]!) if ((set & used[cage]!) === used[cage]) possible |= set & ~used[cage]!
      const mask = possible & ~(rows[row]! | columns[column]! | boxes[boxOf(cell)]!) & ALL
      const count = sudokuDigits(mask).length
      if (!count) return
      if (count < smallest) { target = cell; options = mask; smallest = count; if (count === 1) break }
    }
    if (target < 0) { answers.push([...cells]); return }
    const row = Math.floor(target / 9), column = target % 9, box = boxOf(target), cage = owners[target]!
    while (options && answers.length < 2 && !exhausted) {
      const bit = options & -options; options ^= bit; cells[target] = Math.log2(bit) + 1
      rows[row]! |= bit; columns[column]! |= bit; boxes[box]! |= bit; used[cage]! |= bit
      visit()
      rows[row]! ^= bit; columns[column]! ^= bit; boxes[box]! ^= bit; used[cage]! ^= bit; cells[target] = 0
    }
  }
  visit()
  return answers.length > 1 ? { kind: 'multiple' } : exhausted ? { kind: 'incomplete' }
    : answers.length === 1 ? { kind: 'unique', cells: answers[0]! } : { kind: 'none' }
}

/** Enumerate assignments consistent with the cage and already placed Sudoku digits. */
function cagePossibilities(cage: KillerCage, cells: readonly number[]): Map<number, number> {
  const open = cage.cells.filter(cell => !cells[cell]), placed = cage.cells.filter(cell => cells[cell])
  const remaining = cage.sum - placed.reduce((sum, cell) => sum + cells[cell]!, 0)
  const used = placed.reduce((mask, cell) => mask | bitOf(cells[cell]!), 0)
  const allowed = open.map(cell => ALL & ~SUDOKU_PEERS[cell]!.reduce((mask, peer) => cells[peer] ? mask | bitOf(cells[peer]!) : mask, 0))
  const possible = Array<number>(open.length).fill(0), chosen = Array<number>(open.length).fill(0)
  const visit = (index: number, sum: number, occupied: number) => {
    if (index === open.length) {
      if (sum === remaining) chosen.forEach((bit, i) => { possible[i]! |= bit })
      return
    }
    let mask = allowed[index]! & ~occupied
    while (mask) {
      const bit = mask & -mask; mask ^= bit
      const digit = Math.log2(bit) + 1
      if (sum + digit > remaining) continue
      chosen[index] = bit
      visit(index + 1, sum + digit, occupied | bit)
    }
  }
  visit(0, 0, used)
  return new Map(open.map((cell, i) => [cell, possible[i]!]))
}

const verifiedBoards = new WeakMap<KillerSudokuBoard, SudokuSolution>()
export function findKillerSudokuHint(board: KillerSudokuBoard, game: SudokuGame): SudokuHintResult {
  let verified = verifiedBoards.get(board)
  if (!verified) { verified = solveKillerSudoku(board); verifiedBoards.set(board, verified) }
  if (verified.kind !== 'unique') return { kind: 'unverified' }
  const mistake = game.cells.findIndex((value, cell) => value !== 0 && value !== verified.cells[cell])
  if (mistake >= 0) return { kind: 'mistake', cell: mistake }
  let best: { cage: KillerCage; cell: number; mask: number } | null = null
  const possible = Array<number>(81).fill(0)
  for (const cage of board.cages) for (const [cell, mask] of cagePossibilities(cage, game.cells)) {
    possible[cell] = mask
    if (!mask) return { kind: 'contradiction' }
    const notes = game.notes[cell]!
    if (!sudokuSingle(mask) && notes !== 0 && !(notes & ~mask)) continue
    if (!best || sudokuDigits(mask).length < sudokuDigits(best.mask).length) best = { cage, cell, mask }
  }
  if (!best || !sudokuSingle(best.mask)) {
    for (const [index, unit] of SUDOKU_UNITS.entries()) for (let digit = 1; digit <= 9; digit++) {
      if (unit.some(cell => game.cells[cell] === digit)) continue
      const candidates = unit.filter(cell => !game.cells[cell] && (possible[cell]! & bitOf(digit)))
      if (candidates.length !== 1) continue
      const cell = candidates[0]!, group = index < 9 ? `Row ${index + 1}` : index < 18 ? `Column ${index - 8}` : `Box ${index - 17}`
      const supportingReasons = unit.filter(i => i !== cell && !game.cells[i]).map(other => {
        const blocker = SUDOKU_PEERS[other]!.find(peer => game.cells[peer] === digit)
        if (blocker !== undefined) return `${sudokuCellName(other)} sees ${digit} at ${sudokuCellName(blocker).toLowerCase()}.`
        const cage = board.cages.find(entry => entry.cells.includes(other))!
        return `${sudokuCellName(other)} cannot be ${digit} under its ${cage.sum} cage and the placed digits.`
      })
      return { kind: 'hint', hint: { cell, candidates: bitOf(digit), source: game, support: unit.filter(i => i !== cell), supportingReasons,
        reasons: [`${group} needs a ${digit}. Considering the cage totals and placed digits, ${sudokuCellName(cell).toLowerCase()} is the only possible position for it.`] } }
    }
  }
  if (!best) return { kind: 'none' }
  const { cage, cell, mask } = best
  const filled = cage.cells.filter(i => game.cells[i]), total = filled.reduce((sum, i) => sum + game.cells[i]!, 0)
  const open = cage.cells.length - filled.length, remaining = cage.sum - total
  const premise = filled.length ? `The ${cage.sum} cage has ${remaining} left for ${open} empty ${open === 1 ? 'cell' : 'cells'}.` : `The ${open} cells in this cage must total ${cage.sum}.`
  const peers = open === 1 ? [] : cage.cells.filter(i => !game.cells[i]).flatMap(i => SUDOKU_PEERS[i]!.filter(peer => game.cells[peer] && !cage.cells.includes(peer)))
  const support = [...new Set([...cage.cells, ...peers])].filter(i => i !== cell)
  const reason = open === 1
    ? filled.length ? `The ${cage.sum} cage already contains ${filled.map(i => game.cells[i]).join(' + ')} = ${total}, so its last cell must be ${remaining}.` : `This cage has one cell and totals ${cage.sum}, so that cell must be ${remaining}.`
    : `${premise} Digits cannot repeat in a cage, row, column or box. With the placed digits, ${sudokuCellName(cell).toLowerCase()} can only be ${sudokuDigits(mask).join(', ')}.`
  return { kind: 'hint', hint: { cell, candidates: mask, source: game, support, reasons: [reason] } }
}

export function applyKillerSudokuHint(board: KillerSudokuBoard, game: SudokuGame, hint: SudokuHint): SudokuGame {
  if (game !== hint.source || board.givens[hint.cell] !== 0) return game
  if (hint.correction) return editKillerSudoku(board, game, hint.cell, 0)
  if (sudokuSingle(hint.candidates)) return editKillerSudoku(board, game, hint.cell, Math.log2(hint.candidates) + 1)
  const notes = [...game.notes]; notes[hint.cell] = hint.candidates
  return { cells: game.cells, notes }
}
