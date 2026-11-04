import { DIRECTIONS, endsTowards, LINE_ENDS, OPPOSITE, PIECE_COUNT, PIECE_ENDS, type TrackGrid } from './tracks'
import { CROSS, isTracksSolved, MAYBE, type TracksGame } from './tracksGame'

type Solution = { kind: 'unique'; pieces: readonly number[] } | { kind: 'none' | 'multiple' | 'limit' }
export type TracksEntryCheck = { kind: 'correct' | 'unverified' } | { kind: 'mistake'; cell: number }

/** Count up to two complete routes independently of player marks. */
export function solveTracks(grid: TrackGrid, maxWork = 2_000_000): Solution {
  if (!Number.isSafeInteger(maxWork) || maxWork < 0) throw Error('Invalid search budget')
  const limit = Symbol('search limit')
  let work = 0, used = 0, openEnds = 0
  const spend = () => { if (++work > maxWork) throw limit }
  const pieces = Array<number>(grid.cellCount).fill(0), parent = pieces.map((_, cell) => cell)
  const rows = Array<number>(grid.height).fill(0), cols = Array<number>(grid.width).fill(0)
  const found: number[][] = []
  try {
    const choices = pieces.map((_, cell) => {
      const given = grid.givens[cell]!
      const options = given ? [given] : Array.from({ length: PIECE_COUNT + 1 }, (_, piece) => piece)
      return options.filter(piece => {
        spend()
        for (let direction = 0; direction < DIRECTIONS; direction++) {
          const other = grid.neighbour(cell, direction)
          if (other === null) {
            if (!given && endsTowards(piece, direction)) return false
          } else if (grid.givens[other] && endsTowards(piece, direction) !== endsTowards(grid.givens[other]!, (direction + OPPOSITE) % DIRECTIONS)) return false
        }
        return true
      })
    })
    // Avoid path compression: every union has to be reversible on backtracking.
    const root = (cell: number) => {
      while (parent[cell] !== cell) { spend(); cell = parent[cell]! }
      return cell
    }
    const closedTooSoon = (cell: number) => {
      const component = root(cell)
      for (let other = 0; other <= cell; other++) {
        spend()
        if (!pieces[other] || root(other) !== component) continue
        for (const direction of PIECE_ENDS[pieces[other]!]!) {
          const next = grid.neighbour(other, direction)
          if (next !== null && next > cell) return false
        }
      }
      return used !== grid.total || openEnds !== LINE_ENDS
    }
    const visit = (cell: number): void => {
      spend()
      if (cell === grid.cellCount) {
        if (openEnds === LINE_ENDS && isTracksSolved({ grid, pieces })) found.push([...pieces])
        return
      }
      const { row, col } = grid.coords(cell)
      if (col === 0 && row > 0 && rows[row - 1] !== grid.rowClues[row - 1]) return
      for (const piece of choices[cell]!) {
        spend()
        let fits = true
        for (const direction of [0, 3]) {
          const other = grid.neighbour(cell, direction)
          if (other !== null && endsTowards(piece, direction) !== endsTowards(pieces[other]!, (direction + OPPOSITE) % DIRECTIONS)) { fits = false; break }
        }
        const occupied = Number(piece !== 0), rowUsed = rows[row]! + occupied, colUsed = cols[col]! + occupied
        if (!fits || rowUsed > grid.rowClues[row]! || colUsed > grid.colClues[col]!
          || rowUsed + grid.width - 1 - col < grid.rowClues[row]!
          || colUsed + grid.height - 1 - row < grid.colClues[col]!) continue
        const outside = PIECE_ENDS[piece]!.filter(direction => grid.neighbour(cell, direction) === null).length
        if (openEnds + outside > LINE_ENDS) continue
        const changed: number[] = []
        for (const direction of PIECE_ENDS[piece]!) {
          const other = grid.neighbour(cell, direction)
          if (other !== null && other < cell && pieces[other]) {
            const a = root(cell), b = root(other)
            if (a !== b) { parent[b] = a; changed.push(b) }
          }
        }
        pieces[cell] = piece; rows[row] = rowUsed; cols[col] = colUsed; used += occupied; openEnds += outside
        if (!piece || !closedTooSoon(cell)) visit(cell + 1)
        pieces[cell] = 0; rows[row]! -= occupied; cols[col]! -= occupied; used -= occupied; openEnds -= outside
        for (const changedRoot of changed) parent[changedRoot] = changedRoot
        if (found.length === 2) return
      }
    }
    visit(0)
  } catch (error) {
    if (error !== limit) throw error
    return { kind: 'limit' }
  }
  return found.length === 1 ? { kind: 'unique', pieces: found[0]! } : { kind: found.length === 0 ? 'none' : 'multiple' }
}

const solutions = new WeakMap<TrackGrid, Solution>()

export function checkTracksEntries(game: TracksGame): TracksEntryCheck {
  let solution = solutions.get(game.grid)
  if (!solution) { solution = solveTracks(game.grid); solutions.set(game.grid, solution) }
  if (solution.kind !== 'unique') return { kind: 'unverified' }
  const cell = game.pieces.findIndex((piece, i) => piece === CROSS ? solution.pieces[i] !== 0
    : piece === MAYBE ? solution.pieces[i] === 0 : piece !== 0 && piece !== solution.pieces[i])
  return cell < 0 ? { kind: 'correct' } : { kind: 'mistake', cell }
}
