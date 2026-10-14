/** Charge the interval to its previous visibility state. */
export type WordClock = { elapsedMs: number; lastAt: number; visible: boolean }
export function advanceWordClock(clock: WordClock, now: number, visible: boolean): WordClock {
  return { elapsedMs: clock.elapsedMs + (clock.visible ? Math.max(0, now - clock.lastAt) : 0), lastAt: now, visible }
}
