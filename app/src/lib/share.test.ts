import { describe, expect, it } from 'vitest'
import { Board } from '../domain/board'
import { buildShareText, boardGrid, puzzleShareLink } from './share'

/**
 * A valid board of any size. The regions are one per row: this suite is about
 * the shape of the share text, not about region geometry, and one-per-row is
 * always a legal partition.
 */
function board(size = 4, puzzleType: 'queens' | 'star-battle' = 'queens'): Board {
  const regions = Array.from({ length: size * size }, (_, cell) => Math.floor(cell / size))
  return new Board(size, regions, new Array(size).fill(1), puzzleType)
}

const b4 = board()

describe('boardGrid', () => {
  it('is one row per rank and one cell per file', () => {
    const rows = boardGrid(b4, new Set()).split('\n')
    expect(rows).toHaveLength(4)
    for (const row of rows) expect([...row]).toHaveLength(4)
  })

  it('fills exactly the cells holding a piece', () => {
    // Top-left and bottom-right of the 4×4.
    const grid = boardGrid(b4, new Set([0, 15]))
    expect(grid.split('\n')[0]).toBe('🟪⬛⬛⬛')
    expect(grid.split('\n')[3]).toBe('⬛⬛⬛🟪')
    expect(grid.split('\n')[1]).toBe('⬛⬛⬛⬛')
  })

  it('uses one cell glyph width for both states, so the grid keeps its columns', () => {
    // Both cells must be single code points: a two-code-point emoji would be
    // twice as wide as its partner and shear the whole grid.
    const row = boardGrid(b4, new Set([0, 1])).split('\n')[0] ?? ''
    expect([...row]).toHaveLength(4)
    expect(new Set([...row]).size).toBe(2)
  })

  it('scales to the board it is given', () => {
    const rows = boardGrid(board(8), new Set()).split('\n')
    expect(rows).toHaveLength(8)
    for (const row of rows) expect([...row]).toHaveLength(8)
  })
})

describe('buildShareText', () => {
  const input = {
    board: b4,
    pieces: new Set([0, 5, 10, 15]),
    puzzleType: 'queens' as const,
    elapsedMs: 263_000,
    hints: 0,
    streak: 4,
    link: 'https://puzzles.example/#/archive/2026-09-30',
  }

  it('names the puzzle and its size', () => {
    expect(buildShareText(input).split('\n')[0]).toBe('Daily Puzzles — Queens 4×4')
  })

  it('calls a star battle a Star Battle', () => {
    const text = buildShareText({ ...input, puzzleType: 'star-battle' })
    expect(text.split('\n')[0]).toBe('Daily Puzzles — Star Battle 4×4')
  })

  it('reports the time the way the timer does', () => {
    expect(buildShareText(input).split('\n')[1]).toBe('4:23 · no hints')
  })

  it('counts hints, singular and plural', () => {
    expect(buildShareText({ ...input, hints: 1 }).split('\n')[1]).toBe('4:23 · 1 hint')
    expect(buildShareText({ ...input, hints: 3 }).split('\n')[1]).toBe('4:23 · 3 hints')
  })

  it('includes the finished board and the link', () => {
    const lines = buildShareText(input).split('\n')
    expect(lines).toContain('🟪⬛⬛⬛')
    expect(lines).toContain(input.link)
  })

  it('shows the streak only once there is one to show', () => {
    expect(buildShareText(input)).toContain('4-day streak')
    // A streak of one is not a streak worth claiming, and a broken one is not
    // worth mentioning at all.
    expect(buildShareText({ ...input, streak: 1 })).not.toContain('streak')
    expect(buildShareText({ ...input, streak: 0 })).not.toContain('streak')
  })

  it('puts the link last so it is not scrolled past the grid', () => {
    const lines = buildShareText(input).split('\n')
    expect(lines.at(-1)).toBe(input.link)
  })
})

describe('puzzleShareLink', () => {
  it('keeps the route after the hash', () => {
    // The app routes on the hash, so a path before it opens the site root and
    // shows the wrong puzzle.
    expect(puzzleShareLink('https://puzzles.example', '2026-09-30')).toBe(
      'https://puzzles.example/#/archive/2026-09-30',
    )
  })

  it('does not double the slash on a trailing-slash origin', () => {
    expect(puzzleShareLink('https://puzzles.example/', '2026-09-30')).toBe(
      'https://puzzles.example/#/archive/2026-09-30',
    )
  })

  it('survives a site served from a sub-path', () => {
    expect(puzzleShareLink('https://example.com/queens', '2026-09-30')).toBe(
      'https://example.com/queens/#/archive/2026-09-30',
    )
  })
})
