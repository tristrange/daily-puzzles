import type { Board } from './board'
import { starsPerRow, type GameState } from './game'
import { PUZZLE_PIECE } from './games'
import { firstHint, type Hint } from './hints'

type Solution = { kind: 'unique'; cells: ReadonlySet<number> } | { kind: 'none' | 'multiple' | 'limit' }
export type CheckedHint = Hint | {
  cell: number
  action: 'clear'
  rule: 'wrong-piece' | 'wrong-cross'
  reason: string
  support: readonly number[]
}
type Result = { kind: 'hint'; hint: CheckedHint } | { kind: 'none' } | { kind: 'unverified' }
const solutions = new WeakMap<Board, Solution>()

/** Count up to two complete placements, independently of all player entries. */
export function solveMarks(board: Board, maxStates = 100_000): Solution {
  if (!Number.isSafeInteger(maxStates) || maxStates < 0) throw new Error('Invalid search budget')
  const size = board.size
  const perLine = starsPerRow(board)
  const columns = Array<number>(size).fill(0)
  const regions = Array<number>(board.regionCount).fill(0)
  const placed = new Set<number>()
  const dead = new Set<string>()
  let count = 0
  let answer: ReadonlySet<number> = new Set()
  let states = 0
  const limit = Symbol('search limit')
  const step = () => { if (++states > maxStates) throw limit }

  const visit = (row: number, previous: number): void => {
    step()
    if (row === size) { count += 1; answer = new Set(placed); return }
    if (columns.some((used) => used + size - row < perLine)) return
    const key = `${row}:${previous}:${columns.join(',')}:${regions.join(',')}`
    if (dead.has(key)) return
    const before = count
    const blocked = previous | (previous << 1) | (previous >> 1)
    const choose = (start: number, remaining: number, mask: number): void => {
      step()
      if (remaining === 0) { visit(row + 1, mask); return }
      for (let col = start; col < size && count < 2; col += 1) {
        step()
        if (size - col < remaining * 2 - 1) break
        const cell = board.index(row, col)
        const region = board.regionAt(cell)
        if ((blocked & (1 << col)) || columns[col]! >= perLine || regions[region]! >= board.regionCapacity[region]!) continue
        columns[col]! += 1
        regions[region]! += 1
        placed.add(cell)
        choose(col + 2, remaining - 1, mask | (1 << col))
        placed.delete(cell)
        regions[region]! -= 1
        columns[col]! -= 1
      }
    }
    choose(0, perLine, 0)
    if (count === before) dead.add(key)
  }
  try { visit(0, 0) } catch (error) {
    if (error !== limit) throw error
    return { kind: 'limit' }
  }
  return count === 1 ? { kind: 'unique', cells: answer } : { kind: count === 0 ? 'none' : 'multiple' }
}

/** Correction first, then the existing explained rules. Only called by Hint. */
export function checkedHint(game: GameState): Result {
  const { board, queens, marks } = game
  let solution = solutions.get(board)
  if (!solution) {
    // shortcut: bounded synchronous search on first Hint; use a worker if larger boards make this slow.
    solution = solveMarks(board)
    solutions.set(board, solution)
  }
  if (solution.kind !== 'unique') return { kind: 'unverified' }
  const piece = PUZZLE_PIECE[board.puzzleType].noun
  for (const cell of queens) {
    if (!solution.cells.has(cell)) return { kind: 'hint', hint: {
      cell, action: 'clear', rule: 'wrong-piece', support: [],
      reason: `This ${piece} cannot be part of the puzzle’s unique solution. Try removing it.`,
    } }
  }
  for (const cell of marks) {
    if (solution.cells.has(cell)) return { kind: 'hint', hint: {
      cell, action: 'clear', rule: 'wrong-cross', support: [],
      reason: `The unique solution needs a ${piece} in this cell, so this cross rules out a required ${piece}.`,
    } }
  }
  const hint = firstHint(board, queens, marks)
  return hint ? { kind: 'hint', hint } : { kind: 'none' }
}
