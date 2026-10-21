import { hasTentsMatching, isTentsSolved, tentsConflicts, tentsLines, tentsNeighbours, type TentsBoard, type TentsGame } from './tents'

export interface TentsHint { readonly cell: number; readonly value: 1 | 2; readonly reason: string; readonly support: readonly number[] }
export type TentsHintResult = { kind: 'hint'; hint: TentsHint } | { kind: 'none' | 'contradiction' }
export const tentsCellName = (board: TentsBoard, cell: number) => `Row ${Math.floor(cell / board.size) + 1}, column ${cell % board.size + 1}`

/** Explained deductions only. Player tents and grass are starting assumptions. */
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
  const arrangements = lineArrangementHint(board, game, candidates)
  if (arrangements.kind === 'contradiction') return arrangements
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
  return arrangements
}

/** Compare one line's possibilities, never branch through complete board solutions. */
function lineArrangementHint(board: TentsBoard, game: TentsGame, candidates: readonly number[]): TentsHintResult {
  const trees = new Set(board.trees), tents = game.flatMap((value, cell) => value === 1 ? [cell] : [])
  const adjacent = game.map((_, cell) => tentsNeighbours(board, cell))
  const touching = game.map((_, cell) => tentsNeighbours(board, cell, true))
  const blocked = new Set([...board.trees, ...game.flatMap((value, cell) => value === 2 ? [cell] : []),
    ...tents.flatMap(cell => touching[cell]!)])
  let hint: TentsHint | null = null
  for (const line of tentsLines(board)) {
    const fixed = line.cells.filter(cell => game[cell] === 1)
    const possible = line.cells.filter(cell => candidates.includes(cell))
    const needed = line.count - fixed.length, patterns: number[][] = [], support = new Set(line.cells)
    // Parsed boards have at most ten cells per line: at most 2^10 subsets, with no recursive board search.
    const choose = (start: number, extra: number[]): void => {
      if (extra.length !== needed) {
        for (let i = start; i <= possible.length - (needed - extra.length); i++) choose(i + 1, [...extra, possible[i]!])
        return
      }
      const together = [...tents, ...extra], occupied = new Set(together)
      for (const cell of extra) {
        const neighbour = touching[cell]!.find(other => occupied.has(other))
        if (neighbour !== undefined) { support.add(neighbour); return }
      }
      if (!hasTentsMatching(board, together)) {
        for (const cell of together) {
          support.add(cell)
          adjacent[cell]!.filter(other => trees.has(other)).forEach(other => support.add(other))
        }
        return
      }
      const unavailable = new Set([...blocked, ...line.cells.filter(cell => !occupied.has(cell)),
        ...extra.flatMap(cell => touching[cell]!)])
      const stranded = board.trees.find(tree => adjacent[tree]!.every(cell => unavailable.has(cell)))
      if (stranded !== undefined) {
        support.add(stranded)
        adjacent[stranded]!.forEach(cell => support.add(cell))
        return
      }
      patterns.push(line.cells.filter(cell => occupied.has(cell)))
    }
    choose(0, [])
    if (!patterns.length) return { kind: 'contradiction' }
    if (hint) continue
    const target = possible.find(cell => patterns.every(pattern => pattern.includes(cell)) || patterns.every(pattern => !pattern.includes(cell)))
    if (target === undefined) continue
    const value = patterns[0]!.includes(target) ? 1 : 2
    const axis = line.name.startsWith('Row') ? 'column' : 'row'
    const positions = patterns.length <= 4
      ? `Possible tent ${axis}s: ${patterns.map(pattern => pattern.map(cell => line.cells.indexOf(cell) + 1).join(', ')).join('; ')}.`
      : ''
    hint = { cell: target, value, support: [...support].sort((a, b) => a - b),
      reason: `${line.name} needs ${line.count} tent${line.count === 1 ? '' : 's'}. Keep tents apart, allow each placed tent its own tree and leave every tree a possible tent.\n${patterns.length} possible arrangement${patterns.length === 1 ? ' remains' : 's remain'}.${positions ? ` ${positions}` : ''}\n${axis === 'column' ? 'Column' : 'Row'} ${line.cells.indexOf(target) + 1} is used in ${value === 1 ? 'every' : 'no'} arrangement, so ${value === 1 ? 'place a tent' : 'mark grass'}.`,
    }
  }
  return hint ? { kind: 'hint', hint } : { kind: 'none' }
}
