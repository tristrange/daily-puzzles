/**
 * The text a player pastes when they have finished a puzzle.
 *
 * Built as a pure function of the finished position, because the shape of this
 * output is the thing worth testing: a grid that is `size` rows of `size` cells,
 * a time that reads the way the timer reads, and a link that opens the same
 * puzzle. None of that is obvious once it is buried in a click handler.
 *
 * The board is shared as a grid rather than as text like `r1c5,r2c3`: a share
 * that needs the recipient to hold the rule in their head is not much of a
 * share, and a grid is the form this genre already reads.
 */

import type { Board, PuzzleType } from '../domain/board'
import { PUZZLE_TYPE_LABEL } from '../domain/games'
import { trackVariantOf } from '../domain/trackSizes'
import { formatTime } from '../domain/game'
import { PIECE_GLYPHS, TrackGrid } from '../domain/tracks'
import type { WordGame } from '../domain/wordGame'
import { spellPath } from '../domain/wordPaths'

/**
 * Filled and empty cells.
 *
 * Both are squares from the same emoji family and measure the same advance
 * width (verified at 20px in both a monospace and a system font), which is what
 * keeps the grid in columns when it lands in someone else's chat client. Empty
 * is the black square rather than the white one for the same reason Wordle uses
 * it: a white square is invisible on the light background most chat clients
 * default to, and a share that has lost its empty cells reads as scattered dots.
 */
const TRACK_EMPTY = '·'

const FILLED = '🟪'
const EMPTY = '⬛'

/**
 * What a share says about the solve. Deliberately not the board: the point of
 * sharing a daily puzzle is to have a go at the same one, and a share that
 * prints where the pieces went has already done the recipient's work. The
 * facts here are the ones that describe how it went rather than what the answer
 * was, and none of them give the puzzle away.
 */
export type ShareResult = {
  readonly puzzleId: string
  readonly width: number
  readonly height: number
  readonly puzzleType: PuzzleType
  readonly elapsedMs: number
  readonly hints: number
  /** Consecutive days solved ending today; 0 when the streak is broken. */
  readonly streak: number
  /** Where the recipient can play the same puzzle. */
  readonly link: string
  readonly previewBoard?: number
}


/** `size` rows of `size` cells, filled where a piece stands. Only for the spoiler variant. */
export function boardGrid(board: Board, pieces: ReadonlySet<number>): string {
  const rows: string[] = []
  for (let row = 0; row < board.size; row += 1) {
    let line = ''
    for (let col = 0; col < board.size; col += 1) {
      line += pieces.has(board.index(row, col)) ? FILLED : EMPTY
    }
    rows.push(line)
  }
  return rows.join('\n')
}

/**
 * A solved track grid, drawn with its own piece glyphs.
 *
 * Its own function rather than a `boardGrid` that asks what kind of board it has:
 * a cell here shows which way the line turns, which is the answer the share is
 * giving away. Filling the cell would say only that something is there.
 */
export function trackGridText(grid: TrackGrid, pieces: readonly number[]): string {
  const rows: string[] = []
  for (let row = 0; row < grid.height; row += 1) {
    let line = ''
    for (let col = 0; col < grid.width; col += 1) {
      const piece = pieces[grid.index(row, col)] ?? 0
      // A middle dot, and neither of the two answers that look right. The marks
      // board's `EMPTY` is a wide emoji, and a wide emoji beside box-drawing
      // characters that occupy one column shifts every piece after it. A plain
      // space is one wide, but shared text is not in a preformatted block: chat and
      // HTML collapse runs of spaces and trim the ends, so an empty corner would
      // shorten its row and two empty cells in a row would vanish. A visible
      // one-column character survives both.
      line += piece === 0 ? TRACK_EMPTY : (PIECE_GLYPHS[piece] ?? TRACK_EMPTY)
    }
    rows.push(line)
  }
  return rows.join('\n')
}

/**
 * The share, with no solution in it.
 *
 * Line order is deliberate: what was solved, how long it took, the streak, then
 * the link — the last two are what a recipient acts on.
 */
export function buildShareText(result: ShareResult): string {
  return [
    ...headerLines(result),
    ...(result.streak > 1 ? [`${result.streak}-day streak`] : []),
    result.link,
  ].join('\n')
}

/**
 * The share *with* the finished board, for showing a solution to someone who
 * has already finished it — or who asked for it.
 *
 * Kept as a separate function rather than a flag, so the spoiler is something a
 * caller has to ask for by name and the default cannot grow one by accident. It
 * takes the board and the pieces because without them there is nothing to show;
 * `buildShareText` cannot show a board at all, which is the point.
 */
export function buildSolutionShareText(
  result: ShareResult,
  board: Board | TrackGrid,
  pieces: ReadonlySet<number> | readonly number[],
): string {
  const drawing =
    board instanceof TrackGrid
      ? trackGridText(board, pieces as readonly number[])
      : boardGrid(board, pieces as ReadonlySet<number>)
  return [
    ...headerLines(result),
    '',
    drawing,
    '',
    ...(result.streak > 1 ? [`${result.streak}-day streak`] : []),
    result.link,
  ].join('\n')
}

function headerLines(result: ShareResult): [string, string] {
  const hints = result.hints === 0 ? 'no hints' : `${result.hints} hint${result.hints === 1 ? '' : 's'}`
  const variant = result.puzzleType === 'train-tracks' ? trackVariantOf(result.puzzleId) : null
  return [
    `Daily Puzzles — ${PUZZLE_TYPE_LABEL[result.puzzleType]}${result.previewBoard === undefined ? '' : ` preview · Board ${result.previewBoard}`}${variant ? ` ${variant.label}` : ''} ${result.width}×${result.height}`,
    `${formatTime(result.elapsedMs)} · ${hints}`,
  ]
}

/**
 * The address this deployment is served from: the origin plus whatever sub-path
 * it lives under. Vite's `BASE_URL` is that sub-path, and it is the same value
 * `puzzleUrl` uses to find the puzzle files, so a share link and a puzzle fetch
 * can never disagree about where the site is.
 *
 * A project page on GitHub Pages is served from `/<repo>/`, where the origin
 * alone would drop the repository and every shared link would point at the
 * domain root.
 */
export function appBase(origin: string, basePath: string): string {
  const path = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath
  return `${origin.replace(/\/$/, '')}${path}`
}

/**
 * A link to this exact puzzle, for the page as it is actually being served.
 *
 * Everything about the address comes from `window.location` and Vite's
 * `BASE_URL`, which is the same value `puzzleUrl` uses to find puzzle files, so
 * a share link and a puzzle fetch cannot disagree about where the site lives.
 * The pieces are read here rather than at the call site on purpose: a caller
 * that assembled the address itself is a caller that can quietly drop the
 * sub-path, and a unit test cannot see what a component passed in.
 *
 * The route goes after the `#`, because the app routes on the hash:
 * `https://host/app/#/archive/2026-09-30`. Written before it, the path is the
 * site root and shows today's puzzle instead of the shared one. Archive rather
 * than the daily route, because a share is most often read later, when "today"
 * is a different puzzle.
 */
export function puzzleShareLink(id: string, previewBoard?: number): string {
  const base = appBase(window.location.origin, import.meta.env.BASE_URL)
  return previewBoard === undefined
    ? `${base.replace(/\/$/, '')}/#/archive/${id}`
    : `${base.replace(/\/$/, '')}/#/preview/word-paths?board=${previewBoard}`
}

/**
 * Copy text, falling back where the async clipboard is not available.
 *
 * `navigator.clipboard` is undefined outside a secure context and can be
 * refused outright, and `execCommand` is deprecated but still the only thing
 * that works in those cases. Returns whether the text made it, so the caller
 * can say so rather than leaving the player wondering.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText !== undefined) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Refused, or no permission: fall through to the old path.
  }
  return legacyCopy(text)
}

function legacyCopy(text: string): boolean {
  const holder = document.createElement('textarea')
  holder.value = text
  // Off-screen but still focusable, and not display:none — a hidden element
  // cannot be selected, and selection is the whole mechanism here.
  holder.setAttribute('readonly', '')
  holder.style.position = 'fixed'
  holder.style.top = '0'
  holder.style.left = '-9999px'
  document.body.append(holder)
  try {
    holder.select()
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    holder.remove()
  }
}


/** Explicit spoiler share: words and their ordered paths. */
export function buildWordSolutionShareText(result: ShareResult, game: WordGame): string {
  const words = [...game.words].sort((a, b) => a.length - b.length).map((path) => {
    const coordinates = path.map((cell) => `r${Math.floor(cell / game.grid.width) + 1}c${cell % game.grid.width + 1}`)
    return `${spellPath(game.grid, path)}: ${coordinates.join(' → ')}`
  })
  return [...headerLines(result), '', ...words, '', ...(result.streak > 1 ? [`${result.streak}-day streak`] : []), result.link].join('\n')
}

/** Explicit spoiler share: Trio symbols in their solved positions. */
export function buildTrioSolutionShareText(result: ShareResult, cells: readonly number[]): string {
  const symbols = ['·', '☀', '☾', '★']
  const rows = Array.from({ length: 9 }, (_, row) => cells.slice(row * 9, row * 9 + 9).map((value) => symbols[value] ?? '·').join(' '))
  return [...headerLines(result), '', ...rows, '', ...(result.streak > 1 ? [`${result.streak}-day streak`] : []), result.link].join('\n')
}
