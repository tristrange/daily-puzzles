/** Whether this puzzle was opened from the Today page. */
export function cameFromToday(state: unknown): boolean {
  return typeof state === 'object' && state !== null && 'fromToday' in state && state.fromToday === true
}
