import { isTentsSolved, tentsConflicts, tentsLines, tentsNeighbours, type TentsBoard, type TentsGame } from './tents'

export interface TentsHint { readonly cell: number; readonly value: 1 | 2; readonly reason: string; readonly support: readonly number[] }
export type TentsHintResult = { kind: 'hint'; hint: TentsHint } | { kind: 'none' | 'contradiction' }
export const tentsCellName = (board: TentsBoard, cell: number) => `Row ${Math.floor(cell / board.size) + 1}, column ${cell % board.size + 1}`

/** Direct deductions only. Player tents and grass are starting assumptions. */
export function findTentsHint(board: TentsBoard, game: TentsGame): TentsHintResult {
  if (tentsConflicts(board, game).size) return { kind: 'contradiction' }
  if (isTentsSolved(board, game)) return { kind: 'none' }
  const open = game.flatMap((mark, cell) => mark === 0 && !board.trees.includes(cell) ? [cell] : [])
  const candidates = open.filter(cell => tentsNeighbours(board, cell).some(other => board.trees.includes(other))
    && !tentsNeighbours(board, cell, true).some(other => game[other] === 1))
  const lines = tentsLines(board)
  for (const line of lines) {
    const placed = line.cells.filter(cell => game[cell] === 1).length
    if (placed + line.cells.filter(cell => candidates.includes(cell)).length < line.count) return { kind: 'contradiction' }
  }
  const options = board.trees.map(tree => ({ tree, cells: tentsNeighbours(board, tree).filter(cell => game[cell] === 1 || candidates.includes(cell)) }))
  if (options.some(option => !option.cells.length)) return { kind: 'contradiction' }
  for (const cell of open) {
    const neighbours = tentsNeighbours(board, cell)
    if (!neighbours.some(other => board.trees.includes(other))) return { kind: 'hint', hint: {
      cell, value: 2, reason: 'A tent must be directly above, below, left or right of a tree. This cell has no adjacent tree, so mark grass.', support: neighbours,
    } }
    const touching = tentsNeighbours(board, cell, true).filter(other => game[other] === 1)
    if (touching.length) return { kind: 'hint', hint: {
      cell, value: 2, reason: 'Tents cannot touch, even diagonally. The highlighted tent rules out this cell.', support: touching,
    } }
  }
  for (const line of lines) {
    const placed = line.cells.filter(cell => game[cell] === 1).length
    const empty = line.cells.filter(cell => candidates.includes(cell))
    if (empty.length && placed === line.count) return { kind: 'hint', hint: {
      cell: empty[0]!, value: 2, reason: `${line.name} already has its ${line.count} tent${line.count === 1 ? '' : 's'}. Every remaining cell in this line must be grass.`, support: line.cells,
    } }
    if (empty.length && placed + empty.length === line.count) return { kind: 'hint', hint: {
      cell: empty[0]!, value: 1, reason: `${line.name} needs ${line.count - placed} more tent${line.count - placed === 1 ? '' : 's'}, and has exactly that many possible cells left. Each must hold a tent.`, support: line.cells,
    } }
  }
  for (const option of options) {
    if (option.cells.length === 1 && game[option.cells[0]!] === 0) return { kind: 'hint', hint: {
      cell: option.cells[0]!, value: 1, reason: `The tree at ${tentsCellName(board, option.tree).toLowerCase()} has only one possible neighbouring tent cell. Place its tent here.`, support: [option.tree, ...tentsNeighbours(board, option.tree)],
    } }
  }
  return { kind: 'none' }
}
