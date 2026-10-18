/** Direct-rule port of the Trio engine. Notes select useful hints, never prove them. */
import { editTrio, isTrioValue, TRIO_LINES, TRIO_NAMES, type TrioBoard, type TrioGame, type TrioSymbol } from './trio'

type Rule = 'row-count' | 'column-count' | 'no-three' | 'same' | 'different'
export interface TrioHintStep {
  cell: number; before: number; after: number; rule: Rule; group: readonly number[]
  reason: string; dependencies: readonly number[]
}
export interface TrioHint { cell: number; candidates: number; source: TrioGame; steps: readonly TrioHintStep[] }
export type TrioHintResult = { kind: 'hint'; hint: TrioHint } | { kind: 'contradiction' | 'none' }
const symbols = [1, 2, 3] as const
const single = (mask: number) => mask > 0 && (mask & (mask - 1)) === 0
export const trioCellName = (cell: number) => `row ${Math.floor(cell / 9) + 1}, column ${cell % 9 + 1}`
export const trioCandidateNames = (mask: number) => symbols.filter((v) => mask & (1 << (v - 1))).map((v) => TRIO_NAMES[v]).join(' or ')

export function deduceTrio(board: TrioBoard, cells: TrioGame['cells']): { candidates: number[]; steps: TrioHintStep[] } | null {
  if (cells.length !== 81 || !cells.every(isTrioValue) || cells.some((v, i) => board.givens[i] && v !== board.givens[i])) return null
  const candidates = cells.map((v) => v ? 1 << (v - 1) : 7)
  const steps: TrioHintStep[] = [], latest = Array<number>(81).fill(-1)
  let valid = true
  const restrict = (cell: number, allowed: number, rule: Rule, group: readonly number[], premise: string, evidence = group) => {
    const before = candidates[cell]!, after = before & allowed
    if (!after) { valid = false; return }
    if (after === before) return
    const dependencies = [...new Set([...evidence, cell].map((i) => latest[i]!).filter((i) => i >= 0))]
    const conclusion = single(after) ? `must be ${trioCandidateNames(after)}.` : `cannot be ${trioCandidateNames(before & ~after)}.`
    latest[cell] = steps.length
    steps.push({ cell, before, after, rule, group, dependencies, reason: `${premise} Row ${Math.floor(cell / 9) + 1}, column ${cell % 9 + 1} ${conclusion}` })
    candidates[cell] = after
  }
  while (valid) {
    const previous = steps.length
    for (const [index, line] of TRIO_LINES.entries()) {
      const rule = index < 9 ? 'row-count' : 'column-count'
      const lineName = `${index < 9 ? 'Row' : 'Column'} ${index % 9 + 1}`
      for (const symbol of symbols) {
        const bit = 1 << (symbol - 1), fixed = line.filter((cell) => candidates[cell] === bit)
        const possible = line.filter((cell) => candidates[cell]! & bit)
        if (fixed.length > 3 || possible.length < 3) return null
        if (fixed.length === 3) {
          for (const cell of possible) if (candidates[cell] !== bit) restrict(cell, 7 ^ bit, rule, line,
            `${lineName} already contains three ${TRIO_NAMES[symbol].toLowerCase()}s.`, fixed)
        } else if (possible.length === 3) {
          for (const cell of possible) restrict(cell, bit, rule, line,
            `${lineName} needs three ${TRIO_NAMES[symbol].toLowerCase()} symbols, and only ${possible.map(trioCellName).join('; ')} can contain them.`,
            line.filter((i) => !(candidates[i]! & bit)))
        }
      }
    }
    for (const line of TRIO_LINES) for (let start = 0; start < 7; start++) {
      const group = line.slice(start, start + 3)
      for (const symbol of symbols) {
        const bit = 1 << (symbol - 1), fixed = group.filter((cell) => candidates[cell] === bit)
        if (fixed.length === 3) return null
        if (fixed.length === 2) for (const cell of group) if (candidates[cell] !== bit) restrict(cell, 7 ^ bit, 'no-three', group,
          `A ${TRIO_NAMES[symbol]} here would make three consecutive ${TRIO_NAMES[symbol].toLowerCase()}s.`)
      }
    }
    for (const edge of board.relations) {
      const { first: a, second: b } = edge, group = [a, b]
      if (edge.kind === 'same') {
        const shared = candidates[a]! & candidates[b]!
        const premise = `The = clue links ${trioCellName(a)} and ${trioCellName(b)}. These cells must use the same symbol, so only their shared possibilities remain.`
        restrict(a, shared, 'same', group, premise)
        restrict(b, shared, 'same', group, premise)
      } else {
        for (const [from, to] of [[a, b], [b, a]] as const) if (single(candidates[from]!)) restrict(to, 7 ^ candidates[from]!, 'different', group,
          `The × clue requires different symbols. The symbol at ${trioCellName(from)} is ${trioCandidateNames(candidates[from]!)}.`)
      }
    }
    if (steps.length === previous) break
  }
  return valid ? { candidates, steps } : null
}

export function findTrioHint(board: TrioBoard, game: TrioGame): TrioHintResult {
  const deduction = deduceTrio(board, game.cells)
  if (!deduction) return { kind: 'contradiction' }
  const { steps } = deduction
  const index = steps.findIndex((step) => game.cells[step.cell] === 0 &&
    (single(step.after) || game.notes[step.cell] === 0 || (game.notes[step.cell]! & ~step.after) !== 0))
  if (index < 0) return { kind: 'none' }
  const needed = new Set<number>()
  const include = (i: number) => {
    if (needed.has(i)) return
    needed.add(i)
    steps[i]!.dependencies.forEach(include)
  }
  include(index)
  const step = steps[index]!
  return { kind: 'hint', hint: { cell: step.cell, candidates: step.after, source: game,
    steps: [...needed].sort((a, b) => a - b).map((i) => steps[i]!) } }
}

export function applyTrioHint(board: TrioBoard, game: TrioGame, hint: TrioHint): TrioGame {
  if (game !== hint.source || game.cells[hint.cell] !== 0 || board.givens[hint.cell] !== 0) return game
  if (single(hint.candidates)) return editTrio(board, game, hint.cell, { value: Math.log2(hint.candidates) + 1 as TrioSymbol })
  const notes = [...game.notes]
  notes[hint.cell] = hint.candidates
  return { cells: game.cells, notes }
}
