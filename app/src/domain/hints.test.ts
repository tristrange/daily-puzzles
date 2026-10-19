/**
 * The public hint API: what a hint looks like and when no move is forced.
 *
 * The exact cells each rule produces are pinned by the shared hint-cases
 * conformance suite; the tests here cover the contract around it.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Board } from './board'
import { firstHint } from './hints'
import { parsePuzzle } from './puzzle'
import { marksBoard } from './helpers'

const REPO_ROOT = new URL('../../..', import.meta.url).pathname
const CASES_DIR = join(REPO_ROOT, 'conformance', 'hint-cases')

function puzzle(file: string) {
  return parsePuzzle(JSON.parse(readFileSync(join(CASES_DIR, file), 'utf8')))
}

describe('firstHint', () => {
  it('advises the forced queen on an empty puzzle', () => {
    const board = marksBoard(puzzle('2026-05-11.puzzle.json'))
    expect(firstHint(board)).toMatchObject({ cell: 5, action: 'queen', rule: 'single-region' })
  })

  it('advises a dead cell when a line is claimed', () => {
    const board = marksBoard(puzzle('2026-05-12.puzzle.json'))
    expect(firstHint(board)).toMatchObject({ cell: 4, action: 'x', rule: 'intersection' })
  })

  it('reasons from player marks', () => {
    const board = marksBoard(puzzle('2026-05-17.puzzle.json'))
    const marks = new Set([0, 11, 16, 17, 21, 22])
    expect(firstHint(board, new Set(), marks)).toMatchObject({ cell: 5, action: 'x', rule: 'subset' })
  })

  it('is pure: the same state always gives the same hint', () => {
    const board = marksBoard(puzzle('2026-05-11.puzzle.json'))
    const first = firstHint(board)
    const second = firstHint(board)
    expect(second).toEqual(first)
  })

  it('returns null once the queens alone satisfy every row and region', () => {
    // The solution of 2026-05-11: every rule has already fired once, and with
    // all queens placed nothing more can be deduced.
    const board = marksBoard(puzzle('2026-05-11.puzzle.json'))
    const queens = new Set([3, 5, 12, 19, 21])
    expect(firstHint(board, queens)).toBeNull()
  })

  it('returns null for a star battle board rather than a wrong hint', () => {
    // The ported rules are single-star, so a star battle has no hint at all.
    const board = new Board(
      8,
      Array.from({ length: 64 }, (_, cell) => Math.floor(cell / 8)),
      Array.from({ length: 8 }, () => 2),
      'star-battle',
    )
    expect(firstHint(board)).toBeNull()
  })
})
describe('hints never contradict the solution', () => {
  /**
   * The property behind every rule: a hint must be a true statement about the
   * board. Placing a star in a cell that is not in the solution, or marking a
   * solution cell dead, is how a hint becomes wrong rather than merely unhelpful.
   *
   * Scoped honestly: this walks every prefix of the true solution with no marks.
   * That is the reachable state space a player passes through solving in order,
   * and it is a real invariant — but it does *not* reach every rule. The
   * intersection bug review found on #52 needed marks the player drew from
   * deduction, and no prefix supplies them, which is why that walk passed while
   * the rule was still unsound.
   *
   * That specific state is pinned by `2026-09-26-star.puzzle.json` in the
   * conformance suite, which asserts the app and the engine produce the same move
   * for it. The two together: this says a hint is never *false*, the conformance
   * case says it matches the engine on the states deduction reaches.
   *
   * A state that marks a solution cell dead is deliberately not covered: crosses
   * are untrusted player notes, and the engine has no contradiction check for
   * them, so no such state has to yield a sound hint.
   */
  const STAR_SOLUTION = [1, 3, 13, 15, 17, 19, 29, 31, 32, 34, 44, 46, 48, 50, 60, 62]

  it('holds for every prefix of a star board solution', () => {
    const board = marksBoard(puzzle('2026-09-26-star.puzzle.json'))
    let hints = 0
    for (let placed = 0; placed <= STAR_SOLUTION.length; placed += 1) {
      const hint = firstHint(board, new Set(STAR_SOLUTION.slice(0, placed)), new Set())
      if (hint === null) continue
      hints += 1
      if (hint.action === 'queen') {
        expect(STAR_SOLUTION, `placing ${hint.cell} at ${placed} stars`).toContain(hint.cell)
      } else {
        expect(STAR_SOLUTION, `marking ${hint.cell} dead at ${placed} stars`).not.toContain(
          hint.cell,
        )
      }
    }
    expect(hints).toBeGreaterThan(10)
  })
})

describe('hint explanations', () => {
  it('identifies the only available cell and highlights the region that requires it', () => {
    const board = marksBoard(puzzle('2026-05-11.puzzle.json'))
    const hint = firstHint(board)!
    expect(hint.reason).toContain('1 queen')
    expect(hint.reason).toContain('only available cell')
    expect(hint.support).toEqual([]) // The region consists of the target cell alone.
    const afterPlacement = firstHint(board, new Set([5]))!
    expect(afterPlacement.cell).toBe(21)
    // The queen at 5 rules out cell 20 through its column, leaving 21 forced.
    expect(afterPlacement.support).toEqual([20, 5])
  })

  it('explains why a region claims a column without placing a piece', () => {
    const board = marksBoard(puzzle('2026-05-12.puzzle.json'))
    const hint = firstHint(board)!
    expect(hint.action).toBe('x')
    expect(hint.reason).toContain('column 5')
    expect(hint.reason).toContain('room for exactly 1 more queen')
    expect(hint.support).toEqual([19, 24, 9, 14])
  })

  it('reports the remaining star count before consuming a fill candidate', () => {
    const board = marksBoard(puzzle('2026-10-08-star.puzzle.json'))
    const queens = new Set([6, 8, 10, 12, 23, 26, 28, 30, 41])
    const hint = firstHint(board, queens)!
    expect(hint).toMatchObject({ cell: 76, action: 'queen', rule: 'fill' })
    expect(hint.reason).toContain('2 stars')
    expect(hint.reason).toContain('2 available cells')
    expect(hint.support).toContain(75)
    expect(hint.support).not.toContain(76)
    expect([...queens]).toEqual([6, 8, 10, 12, 23, 26, 28, 30, 41])
  })

  it('explains a subset using the combined demand and highlights its source groups', () => {
    const board = marksBoard(puzzle('2026-05-17.puzzle.json'))
    const hint = firstHint(board, new Set(), new Set([0, 11, 16, 17, 21, 22]))!
    expect(hint.rule).toBe('subset')
    expect(hint.reason).toContain('3 queens')
    expect(hint.reason).toContain('room for exactly 3 more queens')
    expect(hint.support).toContain(1)
    expect(hint.support).toContain(2)
    expect(hint.support).not.toContain(hint.cell)
  })
})
