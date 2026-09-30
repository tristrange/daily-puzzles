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
import { Board } from '../domain/board'
import { parsePuzzle } from '../domain/puzzle'
import {
  colourDistance,
  inks,
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

describe('inks', () => {
  it('uses dark ink on light backgrounds and light ink on dark ones', () => {
    expect(inks('#e9c46a').piece).toBe('#1a1a1a')
    expect(inks('#023047').piece).toBe('#f8fafc')
  })

  it('gives every palette colour readable ink', () => {
    for (const colour of REGION_COLOURS) {
      const { piece, mark } = inks(colour)
      expect([piece, mark]).toEqual(expect.arrayContaining([expect.any(String)]))
      expect(piece === '#1a1a1a' || piece === '#f8fafc').toBe(true)
      expect(mark === '#b3261e' || mark === '#f87171').toBe(true)
    }
  })
})
