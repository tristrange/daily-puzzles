import { describe, expect, it } from 'vitest'
import { WordGrid } from './wordPaths'
import { createWordGame, spellPath, traceCell, clearTrace, submitWord, undoWord, resetWordGame, isWordSolved } from './wordGame'
import cases from '@shared/conformance/word-paths/path-cases.json'

const grid = new WordGrid(4, 2, ['C', 'A', 'T', null, 'L', 'I', 'O', 'N'], [3, 4])
const select = (cells: number[]) => cells.reduce(traceCell, createWordGame(grid))

describe('word path rules', () => {
  it.each(cases)('agrees with Python: $name', (entry) => {
    const board = new WordGrid(entry.board.width, entry.board.height, entry.board.letters, entry.board.wordLengths)
    if (entry.word !== null) expect(spellPath(board, entry.cells)).toBe(entry.word)
    else expect(() => spellPath(board, entry.cells)).toThrow()
  })
  it('truncates when returning to an earlier letter', () => {
    const game = select([0, 1, 2])
    expect(traceCell(game, 1).trace).toEqual([0, 1])
    expect(traceCell(game, 0).trace).toEqual([0])
  })
  it('ignores diagonal, blocked and out-of-range selection', () => {
    const game = select([0])
    for (const cell of [5, 3, -1, 8, 0.5]) expect(traceCell(game, cell)).toBe(game)
  })
  it('accepts unused lengths in either order and wins only on complete coverage', () => {
    let game = submitWord(select([4, 5, 6, 7])).game
    expect(isWordSolved(game)).toBe(false)
    for (const cell of [0, 1, 2]) game = traceCell(game, cell)
    expect(submitWord(game).accepted).toBe(true)
    expect(isWordSolved(submitWord(game).game)).toBe(true)
  })
  it('accepts reverse tracing only when the resulting spelling is in the list', () => {
    const net = createWordGame(new WordGrid(3, 1, ['N', 'E', 'T'], [3]))
    expect(submitWord({ ...net, trace: [2, 1, 0] }).accepted).toBe(true)
    expect(submitWord(select([2, 1, 0])).accepted).toBe(false)
  })
  it('refuses words outside the list and already used lengths', () => {
    const xyz = createWordGame(new WordGrid(3, 1, ['X', 'Y', 'Z'], [3]))
    expect(submitWord({ ...xyz, trace: [0, 1, 2] }).message).toContain('word list')
    const game = submitWord(select([0, 1, 2])).game
    expect(traceCell(game, 0)).toBe(game)
    expect(submitWord({ ...game, trace: [0, 1, 2] }).accepted).toBe(false)
    expect(submitWord({ ...game, trace: [4, 5] }).accepted).toBe(false)
  })
  it('never counts overlapping, repeated or illegal stored paths as solved', () => {
    for (const words of [[[0, 1, 2], [4, 5, 6, 0]], [[0, 1, 0], [4, 5, 6, 7]]]) {
      expect(isWordSolved({ ...createWordGame(grid), words })).toBe(false)
    }
  })
  it('can clear a trace, undo accepted words and reset without changing the grid', () => {
    expect(clearTrace(select([0, 1])).trace).toEqual([])
    const game = submitWord(select([0, 1, 2])).game
    expect(undoWord(game).words).toEqual([])
    expect(resetWordGame(game)).toEqual(createWordGame(grid))
  })
})


describe('versioned word acceptance', () => {
  const letters = [null,null,'A','M','E','N','K','C',null,'R','A','B',null,'G','A','I','R','M','E',null,'A','H','C',null,null]
  it.each([
    ['CAME', [7,2,3,4]], ['MEGA', [17,18,13,14]], ['ERA', [4,9,14]],
  ] as const)('accepts %s in v2 without requiring a constructor answer', (word, trace) => {
    const grid = new WordGrid(5, 5, letters, [3,4,5,6], 2)
    const result = submitWord({ ...createWordGame(grid), trace })
    expect(result.accepted).toBe(true)
    expect(result.message).toContain(word)
  })
  it('keeps v1 acceptance unchanged', () => {
    const grid = new WordGrid(5, 5, letters, [3,4,5,6])
    expect(submitWord({ ...createWordGame(grid), trace:[7,2,3,4] }).accepted).toBe(false)
  })
  it('accepts a seven-letter answer only through version 3', () => {
    const letters = ['P', 'I', 'C', 'T', 'U', 'R', 'E']
    const grid = new WordGrid(7, 1, letters, [7], 3)
    expect(submitWord({ ...createWordGame(grid), trace: [0,1,2,3,4,5,6] }).accepted).toBe(true)
    expect(submitWord({ ...createWordGame(new WordGrid(7, 1, letters, [7], 2)), trace: [0,1,2,3,4,5,6] }).accepted).toBe(false)
  })
  it('rejects unknown vocabulary versions at the grid boundary', () => {
    expect(() => new WordGrid(5, 5, letters, [3,4,5,6], 4)).toThrow('vocabulary version')
  })
})
