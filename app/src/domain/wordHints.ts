/** Find one completion from the current words, never from a shipped answer. */
import type { WordGame } from './wordGame'
import { WORD_PATHS_VOCABULARY, type WordGrid } from './wordPaths'
import { WORD_PATHS_V2_VOCABULARY, WORD_PATHS_V3_VOCABULARY } from './wordVocabulary'

export type WordHintResult = { kind: 'hint'; path: readonly number[] }
  | { kind: 'dead-end' | 'limit' | 'none' }

const dictionaries = new Map<number, { words: Set<string>; prefixes: Set<string> }>()
function dictionary(version: 1 | 2 | 3) {
  let result = dictionaries.get(version)
  if (!result) {
    const source = version === 1 ? WORD_PATHS_VOCABULARY
      : version === 2 ? WORD_PATHS_V2_VOCABULARY : WORD_PATHS_V3_VOCABULARY
    const words = new Set(source)
    const prefixes = new Set<string>()
    for (const word of words) for (let n = 1; n <= word.length; n++) prefixes.add(word.slice(0, n))
    result = { words, prefixes }
    dictionaries.set(version, result)
  }
  return result
}

function neighbours(grid: WordGrid, cell: number): number[] {
  const row = Math.floor(cell / grid.width), col = cell % grid.width
  return [row > 0 ? cell - grid.width : -1, col + 1 < grid.width ? cell + 1 : -1,
    row + 1 < grid.height ? cell + grid.width : -1, col > 0 ? cell - 1 : -1]
    .filter((other) => other >= 0 && grid.letters[other] !== null)
}

// shortcut: bounded synchronous search; use a worker if future board sizes make this slow on phones.
export function findWordHint(game: WordGame, maxStates = 50_000): WordHintResult {
  if (!Number.isSafeInteger(maxStates) || maxStates < 0) throw new RangeError('Invalid word search budget')
  const { grid } = game
  const lengths = grid.wordLengths.filter((n) => !game.words.some((path) => path.length === n))
  if (lengths.length === 0) return { kind: 'none' }
  const exhausted = new Error('Word search limit')
  let spent = 0
  const step = () => { if (++spent > maxStates) throw exhausted }
  try {
    step()
    const { words, prefixes } = dictionary(grid.vocabularyVersion)
    // Distinct lengths 3–7 allow at most 25 letters, even in a blocked 7×7 grid.
    let bit = 0
    const bits = grid.letters.map((letter) => letter === null ? 0 : 1 << bit++)
    const occupied = game.words.flat().reduce((mask, cell) => mask | bits[cell]!, 0)
    const adjacent = grid.letters.map((letter, cell) => letter === null ? [] : neighbours(grid, cell))
    type Path = { cells: readonly number[]; mask: number }
    const paths: Path[] = []
    const longest = Math.max(...lengths)
    const walk = (cell: number, prefix: string, cells: readonly number[], mask: number) => {
      step()
      const word = prefix + grid.letters[cell]!
      if (!prefixes.has(word)) return
      const next = [...cells, cell], used = mask | bits[cell]!
      if (lengths.includes(next.length) && words.has(word)) paths.push({ cells: next, mask: used })
      if (next.length === longest) return
      for (const other of adjacent[cell]!) {
        if (!((used | occupied) & bits[other]!)) walk(other, word, next, used)
      }
    }
    for (let cell = 0; cell < grid.cellCount; cell++) {
      if (bits[cell] && !(occupied & bits[cell]!)) walk(cell, '', [], 0)
    }
    const choices = lengths.map((length) => paths.filter((path) => path.cells.length === length))
      .sort((a, b) => a.length - b.length)
    const cover = (index: number, used: number): Path[] | null => {
      step()
      if (index === choices.length) return []
      for (const path of choices[index]!) {
        step()
        if (used & path.mask) continue
        const rest = cover(index + 1, used | path.mask)
        if (rest) return [path, ...rest]
      }
      return null
    }
    const solution = cover(0, occupied)
    if (!solution) return { kind: 'dead-end' }
    solution.sort((a, b) => a.cells.length - b.cells.length)
    return { kind: 'hint', path: solution[0]!.cells }
  } catch (error) {
    if (error === exhausted) return { kind: 'limit' }
    throw error
  }
}
