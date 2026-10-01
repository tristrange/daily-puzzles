/**
 * Whether auto-mark is on.
 *
 * Stored rather than reset each visit, because it is a preference about how
 * someone plays rather than a decision about one board: someone who wants the
 * board to keep showing only the conclusions they drew themselves says so once
 * instead of every day. Same shape as the theme choice in `theme.ts` — one
 * key, a parser that treats anything unrecognised as the default, and reads
 * that survive storage being unavailable.
 *
 * Off is the default, and it is the default for a reason rather than by
 * omission: auto-mark draws conclusions, and a cross the player did not draw is
 * an answer they were given rather than one they reached.
 */

export const AUTO_MARK_STORAGE_KEY = 'daily-puzzles:auto-mark'

/** Absent, hand-edited or left over from a future version: off. */
export function parseAutoMark(value: string | null | undefined): boolean {
  return value === 'true'
}

/**
 * The stored choice, or `false`. Private browsing and blocked storage throw on
 * *access*, not just on write, so this has to be defensive to be worth having.
 */
export function readStoredAutoMark(): boolean {
  try {
    return parseAutoMark(localStorage.getItem(AUTO_MARK_STORAGE_KEY))
  } catch {
    return false
  }
}

export function storeAutoMark(autoMark: boolean): void {
  try {
    localStorage.setItem(AUTO_MARK_STORAGE_KEY, String(autoMark))
  } catch {
    // A choice that lasts until reload is better than a page that breaks.
  }
}
