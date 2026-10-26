import { isNurikabeSolved, nurikabeNeighbours, type NurikabeBoard, type NurikabeGame } from './nurikabe'

export type NurikabeSolution = ({ kind: 'unique'; cells: NurikabeGame } | { kind: 'none' | 'multiple' | 'limit' }) & { nodes: number }

/** Certify the clue-only board. An exhausted search never certifies uniqueness. */
export function solveNurikabe(board: NurikabeBoard, maxNodes = 200_000): NurikabeSolution {
  if (!Number.isSafeInteger(maxNodes) || maxNodes < 0) throw Error('Invalid Nurikabe search budget')
  const count = board.size ** 2, bits = Array.from({ length: count }, (_, i) => 1n << BigInt(i))
  const indexes = new Map(bits.map((bit, i) => [bit, i]))
  const neighbours = bits.map((_, i) => nurikabeNeighbours(board.size, i).reduce((mask, cell) => mask | bits[cell]!, 0n))
  const clues = board.clues.flatMap((value, cell) => value ? [cell] : [])
  const clueMask = clues.reduce((mask, cell) => mask | bits[cell]!, 0n), all = (1n << BigInt(count)) - 1n
  const boundary = (mask: bigint) => {
    let result = mask
    while (mask) {
      const bit = mask & -mask; mask ^= bit
      result |= neighbours[indexes.get(bit)!]!
    }
    return result
  }
  let nodes = 0, found = 0, answer: NurikabeGame = []
  const exhausted = Symbol('Nurikabe search limit')
  const charge = () => { if (nodes >= maxNodes) throw exhausted; nodes++ }
  try {
    charge()
    if (board.clues.reduce((sum, value) => sum + value, 0) >= count || clues.some(cell => neighbours[cell]! & clueMask)) return { kind: 'none', nodes }
    const candidates = clues.map(clue => {
      const target = board.clues[clue]!, allowed = all & ~boundary(clueMask ^ bits[clue]!)
      const seen = new Set<bigint>(), shapes: { mask: bigint; halo: bigint }[] = []
      const grow = (mask: bigint, frontier: bigint, size: number): void => {
        charge()
        if (seen.has(mask)) return
        seen.add(mask)
        if (size === target) { shapes.push({ mask, halo: boundary(mask) }); return }
        while (frontier) {
          const bit = frontier & -frontier; frontier ^= bit
          const next = mask | bit
          grow(next, boundary(next) & allowed & ~next, size + 1)
        }
      }
      grow(bits[clue]!, neighbours[clue]! & allowed, 1)
      return shapes
    }).sort((a, b) => a.length - b.length)
    if (candidates.some(shapes => !shapes.length)) return { kind: 'none', nodes }
    const visit = (index: number, occupied: bigint, blocked: bigint): void => {
      if (index === candidates.length) {
        const cells = bits.map(bit => occupied & bit ? 2 : 1) satisfies NurikabeGame
        if (isNurikabeSolved(board, cells)) { found++; answer = cells }
        return
      }
      for (const { mask, halo } of candidates[index]!) {
        charge()
        if (mask & blocked) continue
        visit(index + 1, occupied | mask, blocked | halo)
        if (found === 2) return
      }
    }
    visit(0, 0n, 0n)
  } catch (error) {
    if (error !== exhausted) throw error
    return { kind: 'limit', nodes }
  }
  return found === 1 ? { kind: 'unique', cells: answer, nodes } : { kind: found ? 'multiple' : 'none', nodes }
}
