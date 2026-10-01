/**
 * Region colours, assigned so that regions which touch can never be confused.
 *
 * The palette is hand-picked and stays as it was, but which region gets which
 * colour is no longer `regionId % palette.length`. That expression had no idea
 * where the regions were, so two near-identical swatches could end up sharing
 * an edge: `#219ebc` and `#2a9d8f` are 0.068 apart in OKLab, `#f4a261` and
 * `#eaac8b` 0.046, and against a shared border those pairs read as one shape.
 *
 * Instead the board is coloured as a small optimisation. Distance is Euclidean
 * in OKLab, which is close enough to uniform human judgement that "further
 * apart" reliably means "more distinguishable"; RGB distance is not, because it
 * rates a dark blue and a mid blue as wildly different when they are not.
 * Neighbours include diagonals: two regions meeting at a corner point are just
 * as easy to misread as two sharing an edge.
 *
 * A single greedy pass is not enough. How many colours a region must avoid is
 * set by how many *distinct* colours its neighbours hold, not by how many
 * neighbours it has — three neighbours on three different swatches can rule out
 * nearly the whole palette, and first-fit then has to settle for a pair that
 * fails the floor. So the assignment is climbed rather than guessed: a handful
 * of deterministic starting points (the old `regionId % palette` mapping, plus
 * one greedy pass per rotation of the palette) are each improved by trying every
 * colour for every region until nothing helps, and the best result wins. Ties go
 * to the earlier seed, so the output is stable.
 *
 * "Best" is three things in order, and the order matters. Clearing the floor
 * comes first, because that is the whole point. Then *more distinct colours*:
 * the mapping this replaces gave every region its own colour, and a puzzle that
 * drops to three swatches asks the player to do work the colours were there to
 * do. Only then does it prefer a wider worst-case border, which is what decides
 * between two candidates that already clear the floor and use the same number
 * of colours.
 *
 * Reusing a colour for regions that do *not* touch is deliberate and free: a
 * player identifies a region by the cells around them, and reuse keeps the
 * colours in play few enough to hold in the head.
 *
 * The floor is a target rather than a hard guarantee. Every board this app
 * ships clears it with room to spare — the climb gets the busiest of them to
 * 0.2 with 11 of the 16 colours in use — but a hypothetical dense board could
 * not, and then the widest assignment available is returned rather than none.
 * `regionColours.test.ts` asserts the floor against every shipped puzzle, so
 * that day would fail a test instead of quietly shipping.
 */

import type { Board } from '../domain/board'

/**
 * Sixteen region colours. Unchanged from the palette this shipped with; only
 * the assignment strategy is new.
 */
export const REGION_COLOURS = [
  '#e76f51',
  '#f4a261',
  '#e9c46a',
  '#2a9d8f',
  '#264653',
  '#8ecae6',
  '#219ebc',
  '#023047',
  '#ffb703',
  '#fb8500',
  '#6d597a',
  '#b56576',
  '#eaac8b',
  '#a4c3b2',
  '#cc8b86',
  '#7f9cf5',
] as const

/**
 * The smallest OKLab distance two colours may have and still be told apart when
 * they share a border. Chosen against the palette above: the closest pair in it
 * is 0.046, so 0.2 is more than four times the worst pair the old mapping could
 * put next to each other, and every board this app ships clears it — see
 * `colours.test.ts`, which checks all of them.
 */
export const MIN_NEIGHBOUR_DISTANCE = 0.2

/**
 * How many times `climb` sweeps before giving up. Two is enough in practice; the
 * cap only exists so a pathological board cannot spin.
 */
const SWEEPS = 8

type Lab = readonly [lightness: number, a: number, b: number]

/** sRGB hex to OKLab, following Björn Ottosson's matrices. */
function toOklab(hex: string): Lab {
  const channels = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  const [red, green, blue] = channels as [number, number, number]
  const long = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue)
  const medium = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue)
  const short = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue)
  return [
    0.2104542553 * long + 0.793617785 * medium - 0.0040720468 * short,
    1.9779984951 * long - 2.428592205 * medium + 0.4505937099 * short,
    0.0259040371 * long + 0.7827717662 * medium - 0.808675766 * short,
  ]
}

const LABS: ReadonlyMap<string, Lab> = new Map(
  REGION_COLOURS.map((hex) => [hex, toOklab(hex)] as const),
)

/** Perceptual distance between two palette hexes (0 = identical). */
export function colourDistance(hexA: string, hexB: string): number {
  const a = LABS.get(hexA)
  const b = LABS.get(hexB)
  if (a === undefined || b === undefined) return Number.POSITIVE_INFINITY
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

/** Every region id that shares an edge or a corner with `regionId`. */
function touchingRegions(board: Board, regionId: number): Set<number> {
  const found = new Set<number>()
  for (const cell of board.cellsOfRegion(regionId)) {
    const { row, col } = board.coords(cell)
    for (let rowStep = -1; rowStep <= 1; rowStep += 1) {
      for (let colStep = -1; colStep <= 1; colStep += 1) {
        if (rowStep === 0 && colStep === 0) continue
        const nextRow = row + rowStep
        const nextCol = col + colStep
        if (nextRow < 0 || nextCol < 0 || nextRow >= board.size || nextCol >= board.size) {
          continue
        }
        const neighbour = board.regionAt(board.index(nextRow, nextCol))
        if (neighbour !== regionId) found.add(neighbour)
      }
    }
  }
  return found
}

/** Each unordered pair of touching regions, once, as `[low, high]` region ids. */
function touchingPairs(board: Board): [number, number][] {
  const pairs: [number, number][] = []
  for (let regionId = 0; regionId < board.regionCount; regionId += 1) {
    for (const neighbour of touchingRegions(board, regionId)) {
      if (neighbour > regionId) pairs.push([regionId, neighbour])
    }
  }
  return pairs
}

/** The narrowest border anywhere on the board; `Infinity` if none touch. */
function narrowestBorder(pairs: readonly [number, number][], colours: readonly string[]): number {
  let narrowest = Number.POSITIVE_INFINITY
  for (const [low, high] of pairs) {
    narrowest = Math.min(narrowest, colourDistance(colours[low] as string, colours[high] as string))
  }
  return narrowest
}

/** A greedy pass: regions in id order, taking the first colour that clears the floor. */
function greedyPass(board: Board, offset: number): string[] {
  const rotated = REGION_COLOURS.map(
    (_, index) => REGION_COLOURS[(index + offset) % REGION_COLOURS.length] as string,
  )
  const assigned: string[] = []
  for (let regionId = 0; regionId < board.regionCount; regionId += 1) {
    const taken = [...touchingRegions(board, regionId)]
      .map((neighbour) => assigned[neighbour])
      .filter((hex): hex is string => hex !== undefined)
    const acceptable = rotated.find((candidate) =>
      taken.every((other) => colourDistance(candidate, other) >= MIN_NEIGHBOUR_DISTANCE),
    )
    if (acceptable !== undefined) {
      assigned.push(acceptable)
      continue
    }
    // Nothing clears the floor from here: take whatever is furthest from the
    // nearest neighbour, which at least maximises the damage limitation.
    assigned.push(
      rotated.reduce((best, candidate) => {
        const score = (hex: string): number =>
          taken.length === 0
            ? Number.POSITIVE_INFINITY
            : Math.min(...taken.map((other) => colourDistance(hex, other)))
        return score(candidate) > score(best) ? candidate : best
      }, rotated[0] as string),
    )
  }
  return assigned
}

/**
 * A comparable score for an assignment, highest wins: clearing the floor, then
 * using more distinct colours, then the narrowest border. See the note at the
 * top of the file for why that order.
 */
function score(pairs: readonly [number, number][], colours: readonly string[]): number[] {
  const border = narrowestBorder(pairs, colours)
  return border < MIN_NEIGHBOUR_DISTANCE
    ? [0, 0, border]
    : [1, new Set(colours).size, border]
}

function beats(candidate: readonly number[], best: readonly number[]): boolean {
  for (let index = 0; index < candidate.length; index += 1) {
    const left = candidate[index] as number
    const right = best[index] as number
    if (left !== right) return left > right
  }
  return false
}

/**
 * Repeatedly try every colour in every region and keep anything that scores
 * better, until a whole sweep changes nothing. Single-region moves only, which
 * is all it takes here: the seeds are different enough from each other that the
 * result does not depend on which one wins.
 */
function climb(pairs: readonly [number, number][], seed: readonly string[]): string[] {
  let best = [...seed]
  let bestScore = score(pairs, best)
  for (let sweep = 0; sweep < SWEEPS; sweep += 1) {
    let improved = false
    for (let regionId = 0; regionId < best.length; regionId += 1) {
      for (const candidate of REGION_COLOURS) {
        if (candidate === best[regionId]) continue
        const trial = [...best]
        trial[regionId] = candidate
        const trialScore = score(pairs, trial)
        if (beats(trialScore, bestScore)) {
          best = trial
          bestScore = trialScore
          improved = true
        }
      }
    }
    if (!improved) return best
  }
  return best
}

/**
 * A ceiling on search steps, so that a board pathological enough to exhaust it
 * costs a bounded amount of time rather than hanging the page. The search is
 * only reached for boards the climb has already failed on, and those are rare
 * and shallow; this is here so "rare" is not load-bearing.
 */
const SEARCH_BUDGET = 20_000

/**
 * An exact search for an assignment that clears the floor on every touching
 * pair, or `null` if it exhausts its budget or no such assignment exists.
 *
 * This exists because `climb` is a local search: it recolours one region at a
 * time and keeps only changes that improve the score, so it cannot step past a
 * configuration where every single-region change makes something else worse. The
 * first board that proved it — 2026-10-04, published by the nightly pipeline —
 * settled on a touching pair 0.19988 apart when a valid assignment was a
 * handful of steps away. That is a promise this module makes and did not keep.
 *
 * Regions are placed most-constrained-first, and each takes a colour it is not
 * already using where it can, so the answer also tends to use more distinct
 * swatches — the second thing `score` rewards.
 */
function searchAssignment(
  pairs: readonly [number, number][],
  regionCount: number,
): string[] | null {
  const neighbours: number[][] = Array.from({ length: regionCount }, () => [])
  for (const [low, high] of pairs) {
    neighbours[low]?.push(high)
    neighbours[high]?.push(low)
  }
  // Ties broken by id so the order, and so the answer, is deterministic.
  const order = Array.from({ length: regionCount }, (_, id) => id).sort(
    (a, b) => (neighbours[b]?.length ?? 0) - (neighbours[a]?.length ?? 0) || a - b,
  )
  const assigned: (string | null)[] = Array.from({ length: regionCount }, () => null)
  const used = new Set<string>()
  let budget = SEARCH_BUDGET

  const place = (depth: number): boolean => {
    if (depth === order.length) return true
    const region = order[depth] as number
    const taken = (neighbours[region] ?? [])
      .map((neighbour) => assigned[neighbour])
      .filter((hex): hex is string => hex !== null)
    const palette = [
      ...REGION_COLOURS.filter((hex) => !used.has(hex)),
      ...REGION_COLOURS.filter((hex) => used.has(hex)),
    ]
    for (const colour of palette) {
      if (budget <= 0) return false
      budget -= 1
      if (taken.some((other) => colourDistance(colour, other) < MIN_NEIGHBOUR_DISTANCE)) continue
      assigned[region] = colour
      used.add(colour)
      if (place(depth + 1)) return true
      used.delete(colour)
      assigned[region] = null
    }
    return false
  }

  return place(0) ? (assigned as string[]) : null
}

/**
 * The colour for every region id on `board`, in region order. Pure and
 * deterministic: the same board always paints the same regions the same way.
 */
export function regionColours(board: Board): readonly string[] {
  const pairs = touchingPairs(board)
  // The old mapping is the first seed so that a board which already looked fine
  // keeps its colours if nothing better turns up.
  const seeds = [
    Array.from({ length: board.regionCount }, (_, regionId) => {
      return REGION_COLOURS[regionId % REGION_COLOURS.length] as string
    }),
    ...Array.from({ length: REGION_COLOURS.length }, (_, offset) => greedyPass(board, offset)),
  ]
  let best: string[] = []
  let bestScore: number[] = []
  for (const seed of seeds) {
    const candidate = climb(pairs, seed)
    const candidateScore = score(pairs, candidate)
    if (best.length === 0 || beats(candidateScore, bestScore)) {
      best = candidate
      bestScore = candidateScore
    }
  }
  // Only when the climb could not clear the floor. Handing the search a board
  // the climb already handles would repaint days that have been played, for no
  // gain: the colours exist only to tell touching regions apart, and on a board
  // that already does, there is nothing to improve.
  if (bestScore[0] === 0) {
    const exact = searchAssignment(pairs, board.regionCount)
    if (exact !== null) {
      const exactScore = score(pairs, exact)
      if (beats(exactScore, bestScore)) best = exact
    }
  }
  return best
}

/**
 * Ink for a cross-out mark on a given background: red on a light region, a
 * lighter red on a dark one, because the palette spans light sand to near-black
 * and `#b3261e` disappears on `#023047`.
 *
 * The *piece* is not here any more. It used to be, picked light or dark to suit
 * the cell, on the reasoning that one fixed colour could not stay readable
 * across the palette. That is true of the piece as a solid shape — and it is why
 * the piece is now white with a dark outline instead, which keeps one appearance
 * on every cell. See `--piece` in `index.css`, and `pieceInk.test.ts` for the
 * contrast arithmetic that a flat colour would fail.
 *
 * Returns a bare string because a single value needs no wrapper, and the cell
 * sets it as a custom property the mark reads.
 */
export function markInk(hex: string): string {
  const channels = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  const [red, green, blue] = channels as [number, number, number]
  // Relative luminance, with the crossover where white and black tie on contrast
  // against mid grey (0.179) rather than where they look equally bright.
  const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue
  return luminance > 0.179 ? '#b3261e' : '#f87171'
}
