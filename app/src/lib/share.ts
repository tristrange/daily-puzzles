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

import type { Board } from '../domain/board'
import { formatTime } from '../domain/game'

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
  readonly size: number
  readonly puzzleType: 'queens' | 'star-battle'
  readonly elapsedMs: number
  readonly hints: number
  /** Consecutive days solved ending today; 0 when the streak is broken. */
  readonly streak: number
  /** Where the recipient can play the same puzzle. */
  readonly link: string
}

const TYPE_LABEL = { queens: 'Queens', 'star-battle': 'Star Battle' } as const

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
  board: Board,
  pieces: ReadonlySet<number>,
): string {
  return [
    ...headerLines(result),
    '',
    boardGrid(board, pieces),
    '',
    ...(result.streak > 1 ? [`${result.streak}-day streak`] : []),
    result.link,
  ].join('\n')
}

function headerLines(result: ShareResult): [string, string] {
  const hints = result.hints === 0 ? 'no hints' : `${result.hints} hint${result.hints === 1 ? '' : 's'}`
  return [
    `Daily Puzzles — ${TYPE_LABEL[result.puzzleType]} ${result.size}×${result.size}`,
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
export function puzzleShareLink(id: string): string {
  const base = appBase(window.location.origin, import.meta.env.BASE_URL)
  return `${base.replace(/\/$/, '')}/#/archive/${id}`
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
