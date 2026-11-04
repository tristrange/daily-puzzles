import { isTrioSolved, TRIO_LINES, type TrioBoard, type TrioGame, type TrioSymbol } from './trio'

type Solution = { kind: 'unique'; cells: readonly TrioSymbol[] } | { kind: 'none' | 'multiple' | 'limit' }
export type TrioEntryCheck = { kind: 'correct' | 'unverified' } | { kind: 'mistake'; cell: number }

// Every legal row or column has three of each symbol and no run of three.
const patterns: readonly (readonly TrioSymbol[])[] = (() => {
  const result: TrioSymbol[][] = [], line: TrioSymbol[] = [], counts = [0, 0, 0]
  const visit = () => {
    if (line.length === 9) { result.push([...line]); return }
    for (const symbol of [1, 2, 3] as const) {
      if (counts[symbol - 1] === 3 || (line.at(-1) === symbol && line.at(-2) === symbol)) continue
      counts[symbol - 1]!++; line.push(symbol); visit(); line.pop(); counts[symbol - 1]!--
    }
  }
  visit()
  return result
})()

/** Count up to two completions independently of the player's entries. */
export function solveTrio(board: TrioBoard, maxWork = 2_000_000): Solution {
  if (!Number.isSafeInteger(maxWork) || maxWork < 0) throw Error('Invalid search budget')
  const limit = Symbol('search limit')
  let work = 0
  const spend = () => { if (++work > maxWork) throw limit }
  const found: TrioSymbol[][] = []
  try {
    const domains = TRIO_LINES.map(line => {
      const relations = board.relations.flatMap(edge => {
        const first = line.indexOf(edge.first), second = line.indexOf(edge.second)
        return first < 0 || second < 0 ? [] : [{ first, second, kind: edge.kind }]
      })
      return patterns.filter(pattern => {
        spend()
        return line.every((cell, position) => !board.givens[cell] || board.givens[cell] === pattern[position])
          && relations.every(edge => (pattern[edge.first] === pattern[edge.second]) === (edge.kind === 'same'))
      })
    })
    const propagate = (lines: (readonly (readonly TrioSymbol[])[])[]) => {
      for (;;) {
        if (lines.some(domain => domain.length === 0)) return false
        const supports = lines.map(domain => {
          const masks = Array<number>(9).fill(0)
          for (const pattern of domain) {
            spend()
            pattern.forEach((symbol, i) => { masks[i]! |= 1 << (symbol - 1) })
          }
          return masks
        })
        let changed = false
        for (const [index, line] of TRIO_LINES.entries()) {
          const allowed = line.map(cell => supports[Math.floor(cell / 9)]![cell % 9]! & supports[9 + cell % 9]![Math.floor(cell / 9)]!)
          const next = lines[index]!.filter(pattern => {
            spend()
            return pattern.every((symbol, position) => allowed[position]! & (1 << (symbol - 1)))
          })
          changed ||= next.length !== lines[index]!.length
          lines[index] = next
        }
        if (!changed) return true
      }
    }
    const visit = (lines: (readonly (readonly TrioSymbol[])[])[]): void => {
      if (!propagate(lines)) return
      const choices = lines.map((domain, index) => ({ index, size: domain.length })).filter(({ size }) => size > 1)
      if (!choices.length) {
        const cells = lines.slice(0, 9).flatMap(domain => [...domain[0]!])
        if (!isTrioSolved(board, cells)) throw Error('Trio search produced an invalid solution')
        found.push(cells)
        return
      }
      const best = choices.reduce((a, b) => a.size <= b.size ? a : b).index
      for (const pattern of lines[best]!) {
        spend()
        const next = [...lines]; next[best] = [pattern]
        visit(next)
        if (found.length === 2) return
      }
    }
    visit(domains)
  } catch (error) {
    if (error !== limit) throw error
    return { kind: 'limit' }
  }
  return found.length === 1 ? { kind: 'unique', cells: found[0]! } : { kind: found.length === 0 ? 'none' : 'multiple' }
}

const solutions = new WeakMap<TrioBoard, Solution>()

/** Notes are possibilities, not committed symbols. */
export function checkTrioEntries(board: TrioBoard, game: TrioGame): TrioEntryCheck {
  let solution = solutions.get(board)
  if (!solution) { solution = solveTrio(board); solutions.set(board, solution) }
  if (solution.kind !== 'unique') return { kind: 'unverified' }
  const cell = game.cells.findIndex((value, i) => value !== 0 && value !== solution.cells[i])
  return cell < 0 ? { kind: 'correct' } : { kind: 'mistake', cell }
}
