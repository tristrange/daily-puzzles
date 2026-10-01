/**
 * Region colour assignment: the guarantee is about *which* colours end up
 * touching, not which colours exist, so these tests are mostly about adjacency.
 *
 * The strongest case is the shipped archive: every committed puzzle is asserted
 * to have a real, readable border between every pair of touching regions, so a
 * palette edit that quietly reintroduces two look-alike swatches side by side
 * fails here rather than in front of a player.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contrastRatio } from './contrast'
import { Board } from '../domain/board'
import { parsePuzzle } from '../domain/puzzle'
import {
  colourDistance,
  markInk,
  MIN_NEIGHBOUR_DISTANCE,
  REGION_COLOURS,
  regionColours,
} from './colours'

const PUZZLES_DIR = new URL('../../public/puzzles', import.meta.url).pathname

function shippedPuzzles(): { id: string; board: Board }[] {
  return readdirSync(PUZZLES_DIR)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => {
      const puzzle = parsePuzzle(JSON.parse(readFileSync(join(PUZZLES_DIR, name), 'utf8')))
      return { id: puzzle.id, board: puzzle.board }
    })
}

/** One committed puzzle, by date. */
function shippedPuzzle(id: string): { id: string; board: Board } {
  return shippedPuzzles().find((entry) => entry.id === id) as { id: string; board: Board }
}

/** Every pair of regions sharing an edge or a corner, as `[a, b]` id pairs. */
function touchingPairs(board: Board): [number, number][] {
  const pairs = new Set<string>()
  for (let cell = 0; cell < board.cellCount; cell += 1) {
    const { row, col } = board.coords(cell)
    for (let rowStep = -1; rowStep <= 1; rowStep += 1) {
      for (let colStep = -1; colStep <= 1; colStep += 1) {
        if (rowStep === 0 && colStep === 0) continue
        const nextRow = row + rowStep
        const nextCol = col + colStep
        if (nextRow < 0 || nextCol < 0 || nextRow >= board.size || nextCol >= board.size) {
          continue
        }
        const here = board.regionAt(cell)
        const there = board.regionAt(board.index(nextRow, nextCol))
        if (here === there) continue
        pairs.add([Math.min(here, there), Math.max(here, there)].join(','))
      }
    }
  }
  return [...pairs].map((pair) => pair.split(',').map(Number) as [number, number])
}

const BLOCKS = new Board(4, [0, 0, 1, 1, 0, 0, 1, 1, 2, 2, 3, 3, 2, 2, 3, 3], [1, 1, 1, 1], 'queens')
/**
 * 16x16 in 4x4 blocks: 16 regions, the most the palette can colour at all, and
 * the widest board the app allows. Queens needs `size` regions, so a 16-region
 * board has to be 16x16.
 */
const MANY_REGIONS = new Board(
  16,
  Array.from({ length: 256 }, (_, cell) => {
    const row = Math.floor(cell / 16)
    const col = cell % 16
    return (row >> 2) * 4 + (col >> 2)
  }),
  Array.from({ length: 16 }, () => 1),
  'queens',
)

describe('palette', () => {
  it('has no duplicate colours', () => {
    expect(new Set(REGION_COLOURS).size).toBe(REGION_COLOURS.length)
  })

  it('includes pairs that are genuinely close together', () => {
    // The point of the assignment strategy: the palette itself still contains
    // look-alikes, so ordering cannot be what keeps neighbours apart.
    const close = REGION_COLOURS.some((a, index) =>
      REGION_COLOURS.slice(index + 1).some((b) => colourDistance(a, b) < 0.1),
    )
    expect(close).toBe(true)
  })
})

describe('regionColours', () => {
  it('gives every region a colour from the palette', () => {
    for (const colour of regionColours(BLOCKS)) {
      expect(REGION_COLOURS).toContain(colour)
    }
  })

  it('is deterministic', () => {
    expect(regionColours(MANY_REGIONS)).toEqual(regionColours(MANY_REGIONS))
  })

  it('separates every pair of touching regions, on every shipped puzzle', () => {
    const puzzles = shippedPuzzles()
    expect(puzzles.length).toBeGreaterThan(0)
    for (const { id, board } of puzzles) {
      const colours = regionColours(board)
      for (const [a, b] of touchingPairs(board)) {
        const first = colours[a] as string
        const second = colours[b] as string
        const distance = colourDistance(first, second)
        expect(
          distance,
          `${id}: regions ${a} (${first}) and ${b} (${second}) touch but are only ${distance.toFixed(
            3,
          )} apart`,
        ).toBeGreaterThanOrEqual(MIN_NEIGHBOUR_DISTANCE)
      }
    }
  })

  it('gives a shipped region count its own colour per region, as before', () => {
    // The look that shipped: eight regions, eight colours, in palette order.
    // Worth pinning, because dropping to a handful of swatches would be a
    // visible regression even with every border technically clear.
    for (const { board } of shippedPuzzles()) {
      expect(new Set(regionColours(board)).size).toBe(board.regionCount)
    }
  })

  it('keeps the assignment it shipped for a board the climb already handled', () => {
    // The exact search only runs when the climb fails the floor, so a board that
    // already worked is not repainted. Repainting would change the colours of a
    // day people have already played, for no gain, and this pins that.
    const { board } = shippedPuzzle('2026-09-30')
    expect([...regionColours(board)]).toEqual([
      '#f4a261', '#219ebc', '#e9c46a', '#023047',
      '#7f9cf5', '#ffb703', '#264653', '#fb8500',
    ])
  })

  it('colours 2026-10-04, the board that made the pipeline fail', () => {
    // Published by the nightly cron, and the first board the climb could not
    // colour: it settled on a touching pair 0.19988 apart, against a floor of
    // 0.2, which failed the suite and blocked every deploy. Pinned so the day
    // cannot quietly go back to being uncolourable.
    const { board } = shippedPuzzle('2026-10-04')
    expect([...regionColours(board)]).toEqual([
      '#264653', '#2a9d8f', '#e76f51', '#8ecae6',
      '#a4c3b2', '#6d597a', '#f4a261', '#023047',
    ])
  })

  it('colours the densest board the app can build, in bounded time', () => {
    // 8x8 tiled with 2x2 blocks: 16 regions, the most the app can be handed, and
    // a far denser adjacency graph than any shipped day. The search is only
    // reached when the climb fails, but "rare" should not be what keeps this
    // fast, so the worst realistic input is measured rather than assumed.
    const size = 8
    const cells = Array.from({ length: size * size }, (_, cell) => {
      const row = Math.floor(cell / size)
      const col = cell % size
      return Math.floor(row / 2) * 4 + Math.floor(col / 2)
    })
    const board = new Board(size, cells, new Array(16).fill(1), 'star-battle')

    const started = Date.now()
    const colours = regionColours(board)
    const elapsed = Date.now() - started

    for (let a = 0; a < 16; a += 1) {
      for (let b = a + 1; b < 16; b += 1) {
        const touching =
          Math.abs(Math.floor(a / 4) - Math.floor(b / 4)) <= 1 &&
          Math.abs((a % 4) - (b % 4)) <= 1
        if (!touching) continue
        expect(
          colourDistance(colours[a] as string, colours[b] as string),
          `regions ${a} and ${b} touch`,
        ).toBeGreaterThanOrEqual(MIN_NEIGHBOUR_DISTANCE)
      }
    }
    expect(elapsed).toBeLessThan(1000)
  })

  it('counts a colour once per holder, so reuse does not shrink the palette', () => {
    // Found by growing connected 8-region boards and keeping the ones the climb
    // cannot colour. The search first tracked reuse with a Set, so a colour
    // shared by two regions that do not touch was dropped from it when the inner
    // one backtracked — the outer one still held it. Nothing invalid came out:
    // the floor held either way, because it is checked against the neighbours
    // directly. But the search then preferred colours already in use and settled
    // for six distinct swatches here instead of seven, and a board that looks
    // flatter than it needs to is the whole thing this module is for.
    const board = new Board(
      8,
      [
        5, 1, 1, 1, 1, 1, 2, 2, 5, 5, 6, 6, 6, 7, 2, 2,
        0, 5, 5, 6, 7, 7, 2, 2, 3, 3, 3, 7, 7, 7, 2, 2,
        3, 3, 3, 3, 7, 7, 7, 7, 3, 3, 3, 7, 7, 4, 4, 4,
        3, 3, 3, 7, 7, 4, 4, 4, 3, 3, 3, 4, 4, 4, 4, 4,
      ],
      new Array(8).fill(1),
      'queens',
    )
    const colours = regionColours(board)
    expect(new Set(colours).size).toBe(7)
    for (const [a, b] of touchingPairs(board)) {
      expect(
        colourDistance(colours[a] as string, colours[b] as string),
        `regions ${a} and ${b} touch`,
      ).toBeGreaterThanOrEqual(MIN_NEIGHBOUR_DISTANCE)
    }
  })

  it('separates touching regions on a 16-region board too', () => {
    const colours = regionColours(MANY_REGIONS)
    for (const [a, b] of touchingPairs(MANY_REGIONS)) {
      expect(colourDistance(colours[a] as string, colours[b] as string)).toBeGreaterThanOrEqual(
        MIN_NEIGHBOUR_DISTANCE,
      )
    }
  })

  it('reuses colours only between regions that never touch', () => {
    // Reuse is a feature, not a compromise, and the shipped puzzles no longer
    // need it: eight regions get eight colours. A 16-region board cannot, so
    // that is where reuse shows up — and the guarantee has to hold there.
    const colours = regionColours(MANY_REGIONS)
    const shared = new Map<string, number[]>()
    colours.forEach((colour, regionId) => {
      shared.set(colour, [...(shared.get(colour) ?? []), regionId])
    })
    expect([...shared.values()].filter((regions) => regions.length > 1).length).toBeGreaterThan(0)
    const touching = new Set(touchingPairs(MANY_REGIONS).map(([a, b]) => `${a},${b}`))
    for (const regions of shared.values()) {
      for (const a of regions) {
        for (const b of regions) {
          if (a >= b) continue
          expect(
            touching.has(`${a},${b}`),
            `regions ${a} and ${b} share a colour and also touch`,
          ).toBe(false)
        }
      }
    }
  })
})

describe('markInk', () => {
  it('uses dark red on light backgrounds and a lighter red on dark ones', () => {
    expect(markInk('#e9c46a')).toBe('#b3261e')
    expect(markInk('#023047')).toBe('#f87171')
  })

  it('picks one of the two mark inks for every palette colour', () => {
    for (const colour of REGION_COLOURS) {
      expect(['#b3261e', '#f87171']).toContain(markInk(colour))
    }
  })

  // A known defect, left failing on purpose rather than quietly dropped. The
  // cross-out is unreadable on 8 of the 16 region colours -- as low as 1.58:1 on
  // #b56576 -- because choosing by a luminance threshold cannot work across a
  // palette this wide: the mid-tones are too dark for the dark red to clear
  // 3:1 and too light for the light one to. Fixing it means picking the
  // higher-contrast of a much darker and a much lighter red, which changes how
  // every crossed cell looks, so it wants its own decision and its own change.
  //
  // Delete the `.fails` when that lands and this asserts the fix.
  it.fails('gives every palette colour a mark ink that reads on it', () => {
    for (const colour of REGION_COLOURS) {
      expect(
        contrastRatio(markInk(colour), colour),
        `${markInk(colour)} on ${colour}`,
      ).toBeGreaterThanOrEqual(NON_TEXT_MINIMUM)
    }
  })
})

/** The piece tokens as shipped, read from the stylesheet rather than copied. */
function pieceToken(name: string): string {
  const css = readFileSync(new URL('../index.css', import.meta.url).pathname, 'utf8')
  const value = new RegExp(`${name}:\\s*([^;]+);`).exec(css)?.[1]?.trim()
  if (value === undefined) throw new Error(`index.css no longer declares ${name}`)
  return value
}

const PIECE_FILL = () => pieceToken('--piece')
const PIECE_OUTLINE = () => pieceToken('--piece-outline')
const NON_TEXT_MINIMUM = 3

describe('the piece colour', () => {
  // The piece is one fixed white with a dark outline, because a piece that
  // changed colour with the cell read as a state change — as though the light
  // ones were misplaced. These are the numbers that make one appearance viable
  // across a palette running from pale sand to near-black.

  it('is legible on every region colour, by fill or by outline', () => {
    for (const colour of REGION_COLOURS) {
      const best = Math.max(
        contrastRatio(PIECE_FILL(), colour),
        contrastRatio(PIECE_OUTLINE(), colour),
      )
      expect(best, `${colour} has neither fill nor outline at 3:1`).toBeGreaterThanOrEqual(
        NON_TEXT_MINIMUM,
      )
    }
  })

  it('could not be a single flat colour, which is why the outline exists', () => {
    // White alone fails at the pale end, and dark alone would fail at the dark
    // end. Without this test the outline looks like decoration and gets removed
    // by someone tidying the CSS.
    expect(contrastRatio(PIECE_FILL(), '#e9c46a')).toBeLessThan(NON_TEXT_MINIMUM)
    expect(contrastRatio(PIECE_OUTLINE(), '#023047')).toBeLessThan(NON_TEXT_MINIMUM)
  })

  it('is actually stroked with that outline, not merely defined', () => {
    // The contrast above only proves the two colours *could* work. Without this,
    // deleting the stroke in App.css would leave every test green and put a
    // flat white glyph on the pale regions at 1.37:1.
    const css = readFileSync(new URL('../App.css', import.meta.url).pathname, 'utf8')
    const marker = /\.marker\s*\{([^}]*)\}/.exec(css)?.[1]
    expect(marker, 'App.css no longer styles .marker').toBeDefined()
    expect(marker).toMatch(/-webkit-text-stroke:[^;]*var\(--piece-outline\)/)
    expect(marker).toMatch(/color:\s*var\(--piece\)/)
  })

  it('does not depend on the theme', () => {
    // One appearance in light and dark is the point; if these were ever moved
    // into a light-dark() pair the confusion would come straight back.
    const root = readFileSync(new URL('../index.css', import.meta.url).pathname, 'utf8')
    for (const token of ['--piece', '--piece-outline']) {
      const declaration = new RegExp(`${token}:\\s*([^;]+);`).exec(root)?.[1]?.trim()
      expect(declaration, `${token} is missing from index.css`).toBeDefined()
      expect(declaration).not.toMatch(/light-dark/)
    }
  })
})
