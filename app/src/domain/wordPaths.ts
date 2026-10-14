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
  readonly vocabularyVersion: 1 | 2
  readonly width: number
  readonly height: number
  readonly letters: readonly (string | null)[]
  readonly wordLengths: readonly number[]
  readonly cellCount: number

  constructor(width: number, height: number, letters: readonly (string | null)[], wordLengths: readonly number[], vocabularyVersion = 1) {
    if (vocabularyVersion !== 1 && vocabularyVersion !== 2) throw new WordGridError('unsupported vocabulary version')
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
    if (wordLengths.length === 0 || wordLengths.some((n) => !Number.isInteger(n) || n < 3 || n > 6)) {
      throw new WordGridError('word lengths must be integers from 3 to 6')
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
