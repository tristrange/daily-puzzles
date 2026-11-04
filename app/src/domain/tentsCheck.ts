import { isTentsSolved, tentsNeighbours, type TentsBoard, type TentsGame, type TentsMark } from './tents'

type Solution = { kind: 'unique'; tents: ReadonlySet<number> } | { kind: 'none' | 'multiple' | 'limit' }
export type TentsEntryCheck = { kind: 'correct' | 'unverified' } | { kind: 'mistake'; cell: number }

/** Count distinct tent placements, not the possible ways to pair the same tents and trees. */
export function solveTents(board: TentsBoard, maxWork = 2_000_000): Solution {
  if (!Number.isSafeInteger(maxWork) || maxWork < 0) throw Error('Invalid search budget')
  const limit = Symbol('search limit'), trees = new Set(board.trees)
  let work = 0
  const spend = () => { if (++work > maxWork) throw limit }
  const adjacentTrees = Array.from({ length: board.size ** 2 }, (_, cell) => tentsNeighbours(board, cell).filter(other => trees.has(other)))
  const found: Set<number>[] = [], counts = Array<number>(board.size).fill(0), placed: number[] = []
  try {
    const patterns = board.rowClues.map((clue, row) => {
      let allowed = 0
      for (let col = 0; col < board.size; col++) {
        const cell = row * board.size + col
        if (!trees.has(cell) && adjacentTrees[cell]!.length) allowed |= 1 << col
      }
      const options: number[] = []
      for (let mask = 0; mask < 1 << board.size; mask++) {
        spend()
        if ((mask & ~allowed) || (mask & (mask << 1))) continue
        let count = 0
        for (let bits = mask; bits; bits &= bits - 1) count++
        if (count === clue) options.push(mask)
      }
      return options
    })
    const canMatch = () => {
      const owner = new Map<number, number>()
      const assign = (tent: number, seen: Set<number>): boolean => {
        for (const tree of adjacentTrees[tent]!) {
          spend()
          if (seen.has(tree)) continue
          seen.add(tree)
          const previous = owner.get(tree)
          if (previous === undefined || assign(previous, seen)) { owner.set(tree, tent); return true }
        }
        return false
      }
      return placed.every(tent => assign(tent, new Set()))
    }
    const visit = (row: number, previous: number): void => {
      spend()
      if (row === board.size) {
        if (counts.some((count, col) => count !== board.colClues[col]) || !canMatch()) return
        const tents = new Set(placed)
        const game = Array.from({ length: board.size ** 2 }, (_, cell): TentsMark => tents.has(cell) ? 1 : 0)
        if (!isTentsSolved(board, game)) throw Error('Tents search produced an invalid solution')
        found.push(tents)
        return
      }
      for (const mask of patterns[row]!) {
        spend()
        if (mask & (previous | (previous << 1) | (previous >> 1))) continue
        const cols = Array.from({ length: board.size }, (_, col) => col).filter(col => mask & (1 << col))
        const remaining = board.size - row - 1
        if (counts.some((count, col) => {
          const after = count + Number((mask & (1 << col)) !== 0)
          return after > board.colClues[col]! || after + remaining < board.colClues[col]!
        })) continue
        for (const col of cols) { counts[col]!++; placed.push(row * board.size + col) }
        if (canMatch()) visit(row + 1, mask)
        for (const col of cols) counts[col]!--
        placed.length -= cols.length
        if (found.length === 2) return
      }
    }
    visit(0, 0)
  } catch (error) {
    if (error !== limit) throw error
    return { kind: 'limit' }
  }
  return found.length === 1 ? { kind: 'unique', tents: found[0]! } : { kind: found.length === 0 ? 'none' : 'multiple' }
}

const solutions = new WeakMap<TentsBoard, Solution>()

export function checkTentsEntries(board: TentsBoard, game: TentsGame): TentsEntryCheck {
  let solution = solutions.get(board)
  if (!solution) { solution = solveTents(board); solutions.set(board, solution) }
  if (solution.kind !== 'unique') return { kind: 'unverified' }
  const cell = game.findIndex((mark, i) => mark === 1 ? !solution.tents.has(i) : mark === 2 && solution.tents.has(i))
  return cell < 0 ? { kind: 'correct' } : { kind: 'mistake', cell }
}
