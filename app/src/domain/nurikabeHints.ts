import { editNurikabeCell, isNurikabeSolved, nurikabeNeighbours, type NurikabeBoard, type NurikabeGame } from './nurikabe'
import { solveNurikabe } from './nurikabeSolve'

type Rule = 'completed-island' | 'separate-islands' | 'sea-square' | 'island-expansion' | 'unreachable' | 'sea-connection'
type Evidence = { source: NurikabeGame; cell: number; reason: string; support: readonly number[] }
export type NurikabeHint = Evidence & ({ kind: 'deduction'; value: 1 | 2; rule: Rule } | { kind: 'correction' })
export type NurikabeMistake = { kind: 'mistake'; cell: number; source: NurikabeGame }
export type NurikabeHintResult = { kind: 'hint'; hint: NurikabeHint } | NurikabeMistake | { kind: 'none' | 'unverified' }
export const nurikabeCellName = (board: NurikabeBoard, cell: number) => `Row ${Math.floor(cell / board.size) + 1}, column ${cell % board.size + 1}`
const verified = new WeakMap<NurikabeBoard, NurikabeGame>()

/** One direct deduction from explicit marks. Blank cells remain undecided. */
export function nextNurikabeDeduction(board: NurikabeBoard, game: NurikabeGame): NurikabeHint | null {
  if (isNurikabeSolved(board, game)) return null
  const adjacent = game.map((_, cell) => nurikabeNeighbours(board.size, cell))
  const groups: number[][] = [], seen = new Set<number>()
  for (let cell = 0; cell < game.length; cell++) if (game[cell] === 2 && !seen.has(cell)) {
    const group = [cell]; seen.add(cell)
    for (const current of group) for (const next of adjacent[current]!) if (game[next] === 2 && !seen.has(next)) {
      seen.add(next); group.push(next)
    }
    groups.push(group)
  }
  const boundary = (group: readonly number[]) => [...new Set(group.flatMap(cell => adjacent[cell]!))].filter(cell => !group.includes(cell))
  const hint = (cell: number, value: 1 | 2, rule: Rule, reason: string, support: readonly number[]): NurikabeHint => ({
    kind: 'deduction', source: game, cell, value, rule, reason,
    support: [...new Set(support)].filter(other => other !== cell).sort((a, b) => a - b),
  })
  const numbered = groups.filter(group => group.some(cell => board.clues[cell]! > 0))
  for (const group of numbered) {
    const clue = group.find(cell => board.clues[cell]! > 0)!
    if (group.length !== board.clues[clue]) continue
    const target = boundary(group).find(cell => game[cell] === 0)
    if (target !== undefined) return hint(target, 1, 'completed-island',
      `The ${board.clues[clue]}-island is complete at ${group.length} cell${group.length === 1 ? '' : 's'}. Its edge neighbours must be sea.`, group)
  }
  for (let cell = 0; cell < game.length; cell++) if (game[cell] === 0) {
    const touching = numbered.filter(group => group.some(other => adjacent[cell]!.includes(other)))
    if (touching.length > 1) return hint(cell, 1, 'separate-islands',
      'Land here would join two numbered islands. Different islands cannot share an edge, so this cell must be sea.', touching.flat())
  }
  for (let row = 0; row < board.size - 1; row++) for (let col = 0; col < board.size - 1; col++) {
    const first = row * board.size + col, square = [first, first + 1, first + board.size, first + board.size + 1]
    const target = square.find(cell => game[cell] === 0)
    if (target !== undefined && square.filter(cell => game[cell] === 1).length === 3) return hint(target, 2, 'sea-square',
      'The other three cells in this 2×2 square are sea. This cell must be land to prevent a solid sea square.', square)
  }
  for (const group of groups) {
    const clue = group.find(cell => board.clues[cell]! > 0)
    if (clue !== undefined && group.length >= board.clues[clue]!) continue
    const edge = boundary(group), exits = edge.filter(cell => game[cell] === 0)
    if (exits.length === 1) return hint(exits[0]!, 2, 'island-expansion', clue === undefined
      ? 'This land must reach a numbered island. It has only one open way out, so that cell must be land.'
      : `The ${board.clues[clue]}-island needs more land and has only one open way to grow. This cell must be land.`, [...group, ...edge.filter(cell => game[cell] === 1)])
  }
  const clues = board.clues.flatMap((value, cell) => value ? [cell] : []), reachable = new Set<number>()
  for (const clue of clues) {
    const blocked = new Set(clues.filter(cell => cell !== clue).flatMap(cell => [cell, ...adjacent[cell]!]))
    const queue = [{ cell: clue, distance: 1 }], visited = new Set([clue])
    for (const { cell, distance } of queue) {
      reachable.add(cell)
      if (distance >= board.clues[clue]!) continue
      for (const next of adjacent[cell]!) if (game[next] !== 1 && !blocked.has(next) && !visited.has(next)) {
        visited.add(next); queue.push({ cell: next, distance: distance + 1 })
      }
    }
  }
  const unreachable = game.findIndex((value, cell) => value === 0 && !reachable.has(cell))
  if (unreachable >= 0) return hint(unreachable, 1, 'unreachable',
    'No numbered island can reach this cell within its required area without crossing sea or touching another number. It must be sea.',
    [...clues, ...game.flatMap((value, cell) => value === 1 ? [cell] : [])])
  const sea = game.flatMap((value, cell) => value === 1 ? [cell] : [])
  if (sea.length > 1) for (let target = 0; target < game.length; target++) if (game[target] === 0) {
    const reached = new Set([sea[0]!]), queue = [sea[0]!]
    for (const cell of queue) for (const next of adjacent[cell]!) if (next !== target && game[next] !== 2 && !reached.has(next)) {
      reached.add(next); queue.push(next)
    }
    const other = sea.find(cell => !reached.has(cell))
    if (other !== undefined) return hint(target, 1, 'sea-connection',
      'The highlighted sea cells must connect. Making this cell land would cut every possible route between them, so it must be sea.',
      [sea[0]!, other, ...game.flatMap((value, cell) => value === 2 ? [cell] : [])])
  }
  return null
}

/** Verify uniqueness and check explicit mistakes before suggesting a direct rule. */
export function findNurikabeHint(board: NurikabeBoard, game: NurikabeGame): NurikabeHintResult {
  let answer = verified.get(board)
  if (!answer) {
    const result = solveNurikabe(board)
    if (result.kind !== 'unique') return { kind: 'unverified' }
    answer = result.cells; verified.set(board, answer)
  }
  const wrong = game.findIndex((value, cell) => value !== 0 && value !== answer[cell])
  if (wrong >= 0) return { kind: 'mistake', cell: wrong, source: game }
  const hint = nextNurikabeDeduction(board, game)
  return hint ? { kind: 'hint', hint } : { kind: 'none' }
}

export function revealNurikabeMistake(board: NurikabeBoard, game: NurikabeGame, mistake: NurikabeMistake): NurikabeHint | null {
  if (game !== mistake.source || board.clues[mistake.cell] !== 0 || game[mistake.cell] === 0) return null
  return { kind: 'correction', source: game, cell: mistake.cell, support: [],
    reason: `The mark at ${nurikabeCellName(board, mistake.cell).toLowerCase()} disagrees with the verified unique solution. Clear it before continuing.` }
}

export function applyNurikabeHint(board: NurikabeBoard, game: NurikabeGame, hint: NurikabeHint): NurikabeGame {
  if (game !== hint.source || board.clues[hint.cell] !== 0 || (hint.kind === 'deduction' && game[hint.cell] !== 0)) return game
  return editNurikabeCell(board, game, hint.cell, hint.kind === 'correction' ? 0 : hint.value)
}
