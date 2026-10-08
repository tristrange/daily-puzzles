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

const REPO_ROOT = new URL('../../..', import.meta.url).pathname
const CASES_DIR = join(REPO_ROOT, 'conformance', 'hint-cases')

function puzzle(file: string) {
  return parsePuzzle(JSON.parse(readFileSync(join(CASES_DIR, file), 'utf8')))
}

describe('firstHint', () => {
  it('advises the forced queen on an empty puzzle', () => {
    const { board } = puzzle('2026-05-11.puzzle.json')
    expect(firstHint(board)).toEqual({ cell: 5, action: 'queen', rule: 'single-region' })
  })

  it('advises a dead cell when a line is claimed', () => {
    const { board } = puzzle('2026-05-12.puzzle.json')
    expect(firstHint(board)).toEqual({ cell: 4, action: 'x', rule: 'intersection' })
  })

  it('reasons from player marks', () => {
    const { board } = puzzle('2026-05-17.puzzle.json')
    const marks = new Set([0, 11, 16, 17, 21, 22])
    expect(firstHint(board, new Set(), marks)).toEqual({ cell: 5, action: 'x', rule: 'subset' })
  })

  it('is pure: the same state always gives the same hint', () => {
    const { board } = puzzle('2026-05-11.puzzle.json')
    const first = firstHint(board)
    const second = firstHint(board)
    expect(second).toEqual(first)
  })

  it('returns null once the queens alone satisfy every row and region', () => {
    // The solution of 2026-05-11: every rule has already fired once, and with
    // all queens placed nothing more can be deduced.
    const { board } = puzzle('2026-05-11.puzzle.json')
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
    const board = puzzle('2026-09-26-star.puzzle.json').board
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
