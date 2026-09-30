import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatPuzzleLabel, puzzleOfToday } from '../domain/dates'
import { formatTime } from '../domain/game'
import { readStoredStats, summarise } from '../lib/stats'

/** A stat that has nothing to report yet, so it is not shown as a zero. */
function stat(label: string, value: string | null): { label: string; value: string } | null {
  return value === null ? null : { label, value }
}

export function StatsPage() {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  // A snapshot read once per visit, as on the archive page: the history is not
  // going to change while the page is open, and re-reading it per render would
  // let a solve recorded in another tab make the page reflow.
  const [records] = useState(() => readStoredStats())
  const [todayId] = useState(() => puzzleOfToday(new Date(), timeZone))
  const stats = summarise(records, todayId)
  const recent = records.slice(-10).reverse()

  if (stats.solved === 0) {
    return (
      <section>
        <h2 className="page-title">Your stats</h2>
        <p className="status">Nothing yet — solve a puzzle and it will show up here.</p>
        <p className="status">
          These stay in this browser. There is no account and nothing is sent anywhere.{' '}
          <Link to="/">Play today&rsquo;s puzzle</Link>.
        </p>
      </section>
    )
  }

  const tiles = [
    stat('Solved', String(stats.solved)),
    stat('Current streak', stats.currentStreak === 0 ? '—' : `${stats.currentStreak} day${stats.currentStreak === 1 ? '' : 's'}`),
    stat('Best streak', `${stats.bestStreak} day${stats.bestStreak === 1 ? '' : 's'}`),
    stat('Fastest', stats.fastestMs === null ? null : formatTime(stats.fastestMs)),
    stat('Average', stats.averageMs === null ? null : formatTime(stats.averageMs)),
    stat('Hints used', String(stats.hints)),
  ].filter((tile): tile is { label: string; value: string } => tile !== null)

  return (
    <section>
      <h2 className="page-title">Your stats</h2>
      <p className="status">Kept in this browser only. Nothing is sent anywhere.</p>
      <dl className="stats-grid">
        {tiles.map((tile) => (
          <div className="stat" key={tile.label}>
            <dt>{tile.label}</dt>
            <dd>{tile.value}</dd>
          </div>
        ))}
      </dl>
      {stats.byType['star-battle'] > 0 && (
        <p className="status">
          {stats.byType.queens} Queens and {stats.byType['star-battle']} Star Battle.
        </p>
      )}
      <h3 className="page-title">Recent solves</h3>
      <ul className="archive">
        {recent.map((record) => (
          <li key={record.id}>
            <Link to={`/archive/${record.id}`}>{formatPuzzleLabel(record.id, timeZone)}</Link>{' '}
            <span className="stat-detail">
              {formatTime(record.elapsedMs)}
              {record.hints > 0 && ` · ${record.hints} hint${record.hints === 1 ? '' : 's'}`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
