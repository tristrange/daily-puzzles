import { afterEach, describe, expect, it, vi } from 'vitest'
import { Board, type PuzzleType } from '../domain/board'
import { appBase, boardGrid, buildShareText, buildSolutionShareText, puzzleShareLink } from './share'

/**
 * Stand in for a browser at `href`, with Vite's `BASE_URL` set to `basePath`.
 *
 * `puzzleShareLink` reads the address from the environment on purpose, so that
 * the one caller cannot quietly drop the deployment sub-path. That makes it
 * untestable in a node environment until something puts a `window` and a
 * `BASE_URL` there — which is what this does, and what the old version's tests
 * quietly failed to do.
 */
function withBrowserUrl(href: string, basePath: string, run: () => void): void {
  vi.stubGlobal('window', { location: { origin: new URL(href).origin } })
  vi.stubEnv('BASE_URL', basePath)
  try {
    run()
  } finally {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

/**
 * A valid board of any size. The regions are one per row: this suite is about
 * the shape of the share text, not about region geometry, and one-per-row is
 * always a legal partition.
 */
function board(size = 4, puzzleType: PuzzleType = 'queens'): Board {
  const regions = Array.from({ length: size * size }, (_, cell) => Math.floor(cell / size))
  return new Board(size, regions, new Array(size).fill(1), puzzleType)
}

const b4 = board()

/** The two cell glyphs, named here so the "no board" test does not restate them. */
const FILLED_CELL = '\u{1F7EA}'
const EMPTY_CELL = '\u{2B1B}'

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

const result = {
  size: 4,
  puzzleType: 'queens' as const,
  elapsedMs: 263_000,
  hints: 0,
  streak: 4,
  link: 'https://puzzles.example/#/archive/2026-09-30',
}

describe('buildShareText', () => {
  it('names the puzzle and its size', () => {
    expect(buildShareText(result).split('\n')[0]).toBe('Daily Puzzles — Queens 4×4')
  })

  it('calls a star battle a Star Battle', () => {
    expect(buildShareText({ ...result, puzzleType: 'star-battle' }).split('\n')[0]).toBe(
      'Daily Puzzles — Star Battle 4×4',
    )
  })

  it('reports the time the way the timer does', () => {
    expect(buildShareText(result).split('\n')[1]).toBe('4:23 · no hints')
  })

  it('counts hints, singular and plural', () => {
    expect(buildShareText({ ...result, hints: 1 }).split('\n')[1]).toBe('4:23 · 1 hint')
    expect(buildShareText({ ...result, hints: 3 }).split('\n')[1]).toBe('4:23 · 3 hints')
  })

  it('shows the streak only once there is one to show', () => {
    expect(buildShareText(result)).toContain('4-day streak')
    // A streak of one is not a streak worth claiming, and a broken one is not
    // worth mentioning at all.
    expect(buildShareText({ ...result, streak: 1 })).not.toContain('streak')
    expect(buildShareText({ ...result, streak: 0 })).not.toContain('streak')
  })

  it('puts the link last so it is not scrolled past', () => {
    expect(buildShareText(result).split('\n').at(-1)).toBe(result.link)
  })

  it('does not give the solution away', () => {
    // The whole reason for the split. A share is meant to be a challenge, and
    // one that prints the pieces has already done the recipient's work — so
    // this is asserted rather than left to review, because a grid is exactly
    // the kind of thing that gets added back as a "nice touch".
    const text = buildShareText(result)
    expect(text).not.toContain(FILLED_CELL)
    expect(text).not.toContain(EMPTY_CELL)
    for (const line of text.split('\n')) {
      // No run of cell glyphs at all, whatever they are.
      expect(line).not.toMatch(/[\u{1F300}-\u{1FAFF}⯐-⯿\u{2B00}-\u{2BFF}]{2,}/u)
    }
  })

  it('cannot show a board at all, however it is called', () => {
    // It does not take one. There is nothing to pass.
    expect(buildShareText.length).toBe(1)
  })
})

describe('buildSolutionShareText', () => {
  const pieces = new Set([0, 5, 10, 15])

  it('includes the finished board, for showing to someone who has finished it', () => {
    const text = buildSolutionShareText(result, b4, pieces)
    expect(text).toContain(boardGrid(b4, pieces))
    expect(text).toContain(result.link)
  })

  it('keeps the same facts as the plain share', () => {
    const withBoard = buildSolutionShareText(result, b4, pieces)
    const plain = buildShareText(result)
    for (const line of plain.split('\n')) {
      expect(withBoard).toContain(line)
    }
  })

  it('puts the link last even with a board above it', () => {
    expect(buildSolutionShareText(result, b4, pieces).split('\n').at(-1)).toBe(result.link)
  })
})

describe('appBase', () => {
  it('is the origin alone when the site is served from the root', () => {
    expect(appBase('https://example.com', '/')).toBe('https://example.com')
    expect(appBase('https://example.com', '')).toBe('https://example.com')
  })

  it('keeps the sub-path a project page is served from', () => {
    // GitHub Pages serves a project site from /<repo>/, where the origin alone
    // would drop the repository and every shared link would point at the root.
    expect(appBase('https://example.com', '/daily-puzzles/')).toBe('https://example.com/daily-puzzles')
  })

  it('copes with a sub-path that has no trailing slash', () => {
    expect(appBase('https://example.com', '/daily-puzzles')).toBe('https://example.com/daily-puzzles')
  })

  it('does not double a slash on a trailing-slash origin', () => {
    expect(appBase('https://example.com/', '/daily-puzzles/')).toBe('https://example.com/daily-puzzles')
    expect(appBase('https://example.com/', '/')).toBe('https://example.com')
  })
})

describe('puzzleShareLink', () => {
  /**
   * Deployments this has to get right, as `[origin, BASE_URL]`. The sub-path row
   * is the bug this exists for: the helper used to be handed a base that already
   * had the sub-path, so its own tests passed while the only caller — which had
   * nothing but an origin — dropped it on the floor.
   */
  const deployments = [
    { label: 'domain root', origin: 'https://puzzles.example', base: '/', link: 'https://puzzles.example/#/archive/2026-09-30' },
    { label: 'project page', origin: 'https://example.com', base: '/daily-puzzles/', link: 'https://example.com/daily-puzzles/#/archive/2026-09-30' },
    { label: 'trailing-slash origin', origin: 'https://example.com/', base: '/daily-puzzles/', link: 'https://example.com/daily-puzzles/#/archive/2026-09-30' },
    { label: 'sub-path without a trailing slash', origin: 'https://example.com', base: '/daily-puzzles', link: 'https://example.com/daily-puzzles/#/archive/2026-09-30' },
  ]

  it.each(deployments)('is right when served from $label', ({ origin, base, link }) => {
    withBrowserUrl(`${origin}/`, base, () => {
      expect(puzzleShareLink('2026-09-30')).toBe(link)
    })
  })

  it('keeps the Star Battle suffix in the link, so it opens that board', () => {
    // A link that dropped the suffix would land on the day's Queens puzzle, and
    // the recipient would be told they had been sent a Star Battle.
    withBrowserUrl('https://puzzles.example/', '/', () => {
      expect(puzzleShareLink('2026-10-05-star')).toBe(
        'https://puzzles.example/#/archive/2026-10-05-star',
      )
    })
  })

  it('puts the route after the hash, so it survives a paste', () => {
    // Written before the hash it is just a path, which the app serves as its
    // root: the recipient gets today's puzzle instead of the shared one.
    withBrowserUrl('https://puzzles.example/', '/', () => {
      expect(puzzleShareLink('2026-09-30')).toContain('/#/archive/')
    })
  })
})
