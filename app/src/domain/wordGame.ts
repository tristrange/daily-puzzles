/** Pure Word Paths rules, independent of pointer input and storage. */
import { WORD_PATHS_V2_VOCABULARY, WORD_PATHS_V3_VOCABULARY } from './wordVocabulary'
import { WordGrid, spellPath, adjacent, WORD_PATHS_VOCABULARY } from './wordPaths'
export { spellPath } from './wordPaths'

export type WordGame = {
  readonly grid: WordGrid
  readonly words: readonly (readonly number[])[]
  readonly trace: readonly number[]
}
const vocabularies = { 1: new Set(WORD_PATHS_VOCABULARY), 2: new Set(WORD_PATHS_V2_VOCABULARY), 3: new Set(WORD_PATHS_V3_VOCABULARY) }

export function createWordGame(grid: WordGrid): WordGame {
  return { grid, words: [], trace: [] }
}

export function traceCell(game: WordGame, cell: number): WordGame {
  if (!Number.isInteger(cell) || cell < 0 || cell >= game.grid.cellCount || game.grid.letters[cell] === null
    || game.words.some((path) => path.includes(cell))) return game
  const earlier = game.trace.indexOf(cell)
  if (earlier === game.trace.length - 1 && earlier >= 0) return game
  if (earlier >= 0) return { ...game, trace: game.trace.slice(0, earlier + 1) }
  const last = game.trace.at(-1)
  if (last !== undefined && !adjacent(game.grid, last, cell)) return game
  return { ...game, trace: [...game.trace, cell] }
}

export function clearTrace(game: WordGame): WordGame {
  return game.trace.length === 0 ? game : { ...game, trace: [] }
}

export function submitWord(game: WordGame): { game: WordGame; accepted: boolean; message: string } {
  const reject = (message: string) => ({ game, accepted: false, message })
  let word: string
  try { word = spellPath(game.grid, game.trace) }
  catch { return reject('Choose an adjoining path of letters first.') }
  if (game.words.some((path) => path.some((cell) => game.trace.includes(cell)))) {
    return reject('Those letters already belong to an accepted word.')
  }
  if (!game.grid.wordLengths.includes(word.length)) return reject('That length has no word slot.')
  if (game.words.some((path) => path.length === word.length)) return reject('That word length is already filled.')
  if (!vocabularies[game.grid.vocabularyVersion].has(word)) return reject('That spelling is not in this game’s English word list.')
  const next = { ...game, words: [...game.words, [...game.trace]], trace: [] }
  return { game: next, accepted: true, message: `${word} accepted. You can undo it.` }
}

export function undoWord(game: WordGame): WordGame {
  return game.words.length === 0 ? clearTrace(game) : { ...game, words: game.words.slice(0, -1), trace: [] }
}

export function resetWordGame(game: WordGame): WordGame {
  return createWordGame(game.grid)
}

export function isWordSolved(game: WordGame): boolean {
  if (game.words.length !== game.grid.wordLengths.length) return false
  let checked = createWordGame(game.grid)
  for (const path of game.words) {
    const result = submitWord({ ...checked, trace: path })
    if (!result.accepted) return false
    checked = result.game
  }
  return checked.words.reduce((sum, path) => sum + path.length, 0)
    === game.grid.letters.filter((letter) => letter !== null).length
}
