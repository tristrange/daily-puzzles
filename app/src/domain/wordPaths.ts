/** Word Paths geometry and the same frozen word list used by Python v1. */
import vocabularySource from '@shared/engine/src/queens_engine/data/word-paths-en-v1.txt?raw'

export const WORD_PATHS_VOCABULARY: readonly string[] = Object.freeze(
  vocabularySource.split(/\r?\n/).map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#')).sort(),
)

export class WordGridError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'WordGridError'
  }
}

export class WordGrid {
  readonly vocabularyVersion: 1 | 2 | 3
  readonly width: number
  readonly height: number
  readonly letters: readonly (string | null)[]
  readonly wordLengths: readonly number[]
  readonly cellCount: number

  constructor(width: number, height: number, letters: readonly (string | null)[], wordLengths: readonly number[], vocabularyVersion = 1) {
    if (vocabularyVersion !== 1 && vocabularyVersion !== 2 && vocabularyVersion !== 3) throw new WordGridError('unsupported vocabulary version')
    this.vocabularyVersion = vocabularyVersion
    if ([width, height].some((n) => !Number.isInteger(n) || n < 1 || n > 7)) {
      throw new WordGridError('dimensions must be integers from 1 to 7')
    }
    if (letters.length !== width * height) {
      throw new WordGridError('letter count must match the dimensions')
    }
    if (letters.some((letter) => letter !== null && (typeof letter !== 'string' || !/^[A-Z]$/.test(letter)))) {
      throw new WordGridError('cells must contain one A-Z letter or null for a blocker')
    }
    if (wordLengths.length === 0 || wordLengths.some((n) => !Number.isInteger(n) || n < 3 || n > 7)) {
      throw new WordGridError('word lengths must be integers from 3 to 7')
    }
    if (new Set(wordLengths).size !== wordLengths.length) {
      throw new WordGridError('the pilot requires distinct word lengths')
    }
    if (wordLengths.reduce((sum, n) => sum + n, 0) !== letters.filter((letter) => letter !== null).length) {
      throw new WordGridError('word lengths must cover every letter exactly once')
    }
    this.width = width
    this.height = height
    this.cellCount = width * height
    this.letters = Object.freeze([...letters])
    this.wordLengths = Object.freeze([...wordLengths])
    Object.freeze(this)
  }
}

export function spellPath(grid: WordGrid, cells: readonly number[]): string {
  if (cells.length === 0 || new Set(cells).size !== cells.length) {
    throw new WordGridError('A path must be nonempty and cannot reuse a cell.')
  }
  return cells.map((cell, index) => {
    if (!Number.isInteger(cell) || cell < 0 || cell >= grid.cellCount) {
      throw new WordGridError('Path cell is out of range.')
    }
    const letter = grid.letters[cell]
    if (letter === null || letter === undefined) throw new WordGridError('A path cannot enter a blocked cell.')
    const previous = cells[index - 1]
    if (previous !== undefined && !adjacent(grid, previous, cell)) {
      throw new WordGridError('Path steps must be orthogonally adjacent.')
    }
    return letter
  }).join('')
}

export function adjacent(grid: WordGrid, a: number, b: number): boolean {
  return Math.abs(Math.floor(a / grid.width) - Math.floor(b / grid.width))
    + Math.abs(a % grid.width - b % grid.width) === 1
}
