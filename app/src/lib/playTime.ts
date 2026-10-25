export type PlayTime = { readonly elapsedMs: number; readonly attemptElapsedMs?: number }

const whole = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

export function attemptTime(value: unknown, elapsedMs: number): Pick<PlayTime, 'attemptElapsedMs'> {
  return whole(value) && value <= elapsedMs ? { attemptElapsedMs: value } : {}
}

export function validPlayTime(time: PlayTime): boolean {
  return whole(time.elapsedMs) && (time.attemptElapsedMs === undefined
    || (whole(time.attemptElapsedMs) && time.attemptElapsedMs <= time.elapsedMs))
}
