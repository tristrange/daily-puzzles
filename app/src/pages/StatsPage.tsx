import { useRef, useState, type ChangeEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PUZZLE_TYPES } from '../domain/board'
import { formatPuzzleLabel } from '../domain/dates'
import { DEFAULT_PUZZLE_TYPE, PUZZLE_TYPE_LABEL, PUZZLE_TYPE_PUBLISHED } from '../domain/games'
import { SUDOKU_VARIANTS, sudokuVariantOf, killerVariantOf } from '../domain/sudokuLevels'
import { TRACK_VARIANTS, trackVariantOf } from '../domain/trackSizes'
import { formatTime } from '../domain/game'
import {
  clearStats,
  formatSolveCounts,
  importStoredStats,
  mostRecentSolves,
  readStoredStats,
  summarise,
  type Stats,
} from '../lib/stats'
import { useToday } from '../lib/useToday'

/** How many solves the page lists under "Recent solves". */
const RECENT_LIMIT = 10

/** A backup larger than this is not a plausible local solve history. */
const MAX_IMPORT_BYTES = 5 * 1024 * 1024

/** A stat that has nothing to report yet, so it is not shown as a zero. */
function stat(label: string, value: string | null): { label: string; value: string } | null {
  return value === null ? null : { label, value }
}

function StatsSummary({ stats, label }: { stats: Stats; label: string }) {
  const tiles = [
    stat('Solved', String(stats.solved)),
    stat('Current streak', stats.currentStreak === 0 ? '—' : `${stats.currentStreak} day${stats.currentStreak === 1 ? '' : 's'}`),
    stat('Best streak', `${stats.bestStreak} day${stats.bestStreak === 1 ? '' : 's'}`),
    stat('Fastest', stats.fastestMs === null ? null : formatTime(stats.fastestMs)),
    stat('Average', stats.averageMs === null ? null : formatTime(stats.averageMs)),
    stat('Hints used', String(stats.hints)),
  ].filter((tile): tile is { label: string; value: string } => tile !== null)

  return <dl className="stats-grid" aria-label={label}>
    {tiles.map(tile => <div className="stat" key={tile.label}>
      <dt>{tile.label}</dt><dd>{tile.value}</dd>
    </div>)}
  </dl>
}

export function StatsPage() {
  const [params, setParams] = useSearchParams()
  const type = PUZZLE_TYPES.find(type => type === params.get('game') && PUZZLE_TYPE_PUBLISHED[type]) ?? DEFAULT_PUZZLE_TYPE
  const variants = (type === 'sudoku' || type === 'killer-sudoku') ? SUDOKU_VARIANTS : type === 'train-tracks'
    ? [...TRACK_VARIANTS, { name: 'original', label: 'Original' }] : []
  const variant = variants.find(variant => variant.name === params.get('variant')) ?? null
  const gameLabel = `${PUZZLE_TYPE_LABEL[type]}${variant ? ` ${variant.label}` : ''}`
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  // A snapshot read once per visit, as on the archive page: the history is not
  // going to change while the page is open, and re-reading it per render would
  // let a solve recorded in another tab make the page reflow.
  const [records, setRecords] = useState(() => readStoredStats())
  // Two steps, because this cannot be undone and a single stray click should not
  // be able to throw away a streak.
  const [confirming, setConfirming] = useState(false)
  const [notice, setNotice] = useState('')
  const importInput = useRef<HTMLInputElement>(null)
  const todayId = useToday(timeZone)
  const stats = summarise(records, todayId)
  const gameRecords = records.filter(record => record.puzzleType === type && (
    variant === null || ((type === 'sudoku' || type === 'killer-sudoku') ? (killerVariantOf(record.id) ?? sudokuVariantOf(record.id))?.name
      : trackVariantOf(record.id)?.name ?? 'original') === variant.name
  ))
  const gameStats = summarise(gameRecords, todayId)
  const recent = mostRecentSolves(gameRecords, RECENT_LIMIT)
  // Which families the history actually spans: never padded out with one the
  // player has not played, and never missing one they have.
  const solveCounts = formatSolveCounts(stats.byType)

  const forget = () => {
    setRecords([...clearStats()])
    setConfirming(false)
    setNotice('Your solve history has been deleted from this browser.')
  }

  const exportStats = () => {
    const blob = new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'daily-puzzles-stats.json'
    document.body.append(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    setNotice('Stats exported as a JSON backup.')
  }

  const importStats = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (file === undefined) return
    setConfirming(false)
    if (file.size > MAX_IMPORT_BYTES) {
      setNotice('That file is too large to be a stats backup.')
      return
    }
    try {
      const { records: merged, imported, persisted } = importStoredStats(await file.text())
      setRecords([...merged])
      if (imported === 0) {
        setNotice('No valid solves were found in that file.')
      } else if (!persisted) {
        setNotice(`Merged ${imported} solve${imported === 1 ? '' : 's'} for this visit, but this browser refused to save them.`)
      } else {
        setNotice(`Merged ${imported} solve${imported === 1 ? '' : 's'} from that file. ${merged.length} in this browser.`)
      }
    } catch {
      setNotice('That file could not be read.')
    }
  }

  return (
    <section>
      <h1 className="page-title">Your stats</h1>
      {/* One live region, at a fixed position in a single tree shape, so that clearing
          updates its text instead of swapping the page for a new one carrying the
          notice already set. A screen reader announces a change to a region that is
          already there; one mounted with its content in place tends to say nothing.
          It is visible too, so an import failure is not only announced to assistive
          technology. */}
      <p className={notice === '' ? 'stats-notice' : 'stats-notice status'} role="status" aria-live="polite">
        {notice}
      </p>
      {stats.solved === 0 ? (
        <>
          <p className="status">Nothing yet — solve a puzzle and it will show up here.</p>
          <p className="status">
            These stay in this browser. Leaderboard publishing is optional and managed separately.{' '}
            <Link to="/">Play today&rsquo;s puzzle</Link>.
          </p>
        </>
      ) : (
        <>
          <p className="status">Kept in this browser only. <Link to="/leaderboards">Optional leaderboards</Link> publish only results you choose to share.</p>
          <h2 className="page-title">All games</h2>
          <StatsSummary stats={stats} label="All games statistics" />
          {solveCounts !== null && <p className="status">{solveCounts}.</p>}
          <section aria-labelledby="game-stats-heading">
            <h2 className="page-title" id="game-stats-heading">{gameLabel} stats</h2>
            <nav className="game-picker" aria-label="Stats game">
              {PUZZLE_TYPES.filter(type => PUZZLE_TYPE_PUBLISHED[type]).map(game => (
                <Link key={game} to={`/stats?game=${game}`} aria-current={game === type ? 'page' : undefined}>
                  {PUZZLE_TYPE_LABEL[game]}
                </Link>
              ))}
            </nav>
            {variants.length > 0 && <label className="stats-filter">
              {(type === 'sudoku' || type === 'killer-sudoku') ? 'Level' : 'Size'}
              <select value={variant?.name ?? ''} onChange={event => setParams(
                event.target.value ? { game: type, variant: event.target.value } : { game: type }
              )}>
                <option value="">{(type === 'sudoku' || type === 'killer-sudoku') ? 'All levels' : 'All sizes'}</option>
                {variants.map(variant => <option key={variant.name} value={variant.name}>{variant.label}</option>)}
              </select>
            </label>}
            {gameStats.solved > 0 && <>
              <StatsSummary stats={gameStats} label={`${gameLabel} statistics`} />
              <p className="status">Streaks use consecutive puzzle dates for this selection.</p>
            </>}
            <section className="recent-solves" aria-labelledby="recent-solves-heading">
              <h3 className="page-title" id="recent-solves-heading">Recent solves</h3>
              {recent.length === 0 && <p className="status">No {gameLabel} solves yet.</p>}
              <ul className="archive">
                {recent.map((record) => (
                  <li key={record.id}>
                    <Link to={`/archive/${record.id}`}>{formatPuzzleLabel(record.id, timeZone)}</Link>{' '}
                    <span className="stat-detail">
                      {PUZZLE_TYPE_LABEL[record.puzzleType ?? 'queens']}
                      {(record.puzzleType === 'sudoku' || record.puzzleType === 'killer-sudoku') && (killerVariantOf(record.id) ?? sudokuVariantOf(record.id)) && ` ${(killerVariantOf(record.id) ?? sudokuVariantOf(record.id))!.label}`}
                      {record.puzzleType === 'train-tracks' && trackVariantOf(record.id) && ` ${trackVariantOf(record.id)!.label}`}
                      {' · '}{formatTime(record.elapsedMs)}
                      {record.hints > 0 && ` · ${record.hints} hint${record.hints === 1 ? '' : 's'}`}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </section>
        </>
      )}
      <div className="stats-footer">
        <p className="status">
          Export a backup before clearing this browser, or import one from another
          device.
        </p>
        <div className="stats-clear">
          {stats.solved > 0 && (
            <button type="button" className="tool-button" onClick={exportStats}>
              Export stats
            </button>
          )}
          <button
            type="button"
            className="tool-button"
            onClick={() => importInput.current?.click()}
          >
            Import stats
          </button>
          <input
            ref={importInput}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(event) => void importStats(event)}
          />
        </div>
        {stats.solved > 0 && (
          <div className="stats-danger">
            {confirming ? (
              <>
                <p className="status">
                  This deletes every solve across all games in this browser, including the streak. It
                  cannot be undone.
                </p>
                <div className="stats-clear">
                  <button type="button" className="tool-button danger" onClick={forget}>
                    Yes, delete all stats
                  </button>
                  <button
                    type="button"
                    className="tool-button"
                    onClick={() => setConfirming(false)}
                  >
                    Keep them
                  </button>
                </div>
              </>
            ) : (
              <div className="stats-clear">
                <button
                  type="button"
                  className="tool-button"
                  onClick={() => setConfirming(true)}
                >
                  Clear all stats
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
