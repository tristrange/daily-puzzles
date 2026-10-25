import type { PlayTime } from '../lib/playTime'
import { formatTime } from '../domain/game'

export function PlayTimer({ time }: { time: PlayTime }) {
  return <span className="timer play-timer">
    <span className="timer-value" role="timer" aria-label="Elapsed active time">{time.attemptElapsedMs !== undefined && <small>Total </small>}{formatTime(time.elapsedMs)}</span>
    {time.attemptElapsedMs !== undefined && <small className="attempt-timer">Since reset <span role="timer" aria-label="Since reset">{formatTime(time.attemptElapsedMs)}</span></small>}
  </span>
}
