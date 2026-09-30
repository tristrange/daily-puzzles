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

export type ShareInput = {
  readonly board: Board
  /** Cell indices of the placed pieces, i.e. `GameState.queens`. */
  readonly pieces: ReadonlySet<number>
  readonly puzzleType: 'queens' | 'star-battle'
  readonly elapsedMs: number
  readonly hints: number
  /** Consecutive days solved ending today; 0 when the streak is broken. */
  readonly streak: number
  /** Where the recipient can play the same puzzle. */
  readonly link: string
}

const TYPE_LABEL = { queens: 'Queens', 'star-battle': 'Star Battle' } as const

/** `size` rows of `size` cells, filled where a piece stands. */
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

function detailLine(input: ShareInput): string {
  const parts = [`${formatTime(input.elapsedMs)}`]
  parts.push(input.hints === 0 ? 'no hints' : `${input.hints} hint${input.hints === 1 ? '' : 's'}`)
  return parts.join(' · ')
}

/**
 * The whole share. Line order is deliberate: what was solved, how long it took,
 * the board, then the streak and the link — the last two are what a recipient
 * acts on, so they are not buried above the grid.
 */
export function buildShareText(input: ShareInput): string {
  const header = `Daily Puzzles — ${TYPE_LABEL[input.puzzleType]} ${input.board.size}×${input.board.size}`
  const streak = input.streak > 1 ? `${input.streak}-day streak` : null
  return [
    header,
    detailLine(input),
    '',
    boardGrid(input.board, input.pieces),
    '',
    ...(streak === null ? [] : [streak]),
    input.link,
  ].join('\n')
}

/**
 * A link to this exact puzzle.
 *
 * The app routes on the hash, so the path has to go after the `#` to survive a
 * paste into a chat window: `https://host/#/archive/2026-09-30`, not
 * `https://host/archive/2026-09-30`, which would be the site root and quietly
 * show today's puzzle instead. Archive rather than the daily route, because a
 * share is most often read later, when "today" is a different puzzle.
 */
export function puzzleShareLink(origin: string, id: string): string {
  return `${origin.replace(/\/$/, '')}/#/archive/${id}`
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
