import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { archiveStart as ARCHIVE_START } from '../../../conformance/id-cases/manifest.json'
import { PUZZLE_TYPES, type PuzzleType } from '../domain/board'
import { formatPuzzleLabel, puzzleIdParts, puzzleIdFor } from '../domain/dates'
import { NURIKABE_ARCHIVE_START, PUZZLE_TYPE_LABEL, PUZZLE_TYPE_PUBLISHED, TENTS_START, TRIO_START, WORD_PATHS_ARCHIVE_START } from '../domain/games'
import { TRACK_LEGACY_END, TRACK_SIZES_ARCHIVE_START, TRACK_VARIANTS, trackVariantOf, type TrackSize } from '../domain/trackSizes'
import { SUDOKU_ARCHIVE_START, SUDOKU_VARIANTS, sudokuVariantOf, KILLER_START, killerVariantOf } from '../domain/sudokuLevels'
import type { SudokuLevel } from '../domain/sudoku'
import { LeaderboardPanel } from '../components/LeaderboardPanel'
import { useToday } from '../lib/useToday'

const FIRST_DAY: Record<PuzzleType, string> = {
  queens: ARCHIVE_START,
  'star-battle': ARCHIVE_START,
  'train-tracks': ARCHIVE_START,
  'word-paths': WORD_PATHS_ARCHIVE_START,
  trio: TRIO_START,
  tents: TENTS_START,
  sudoku: SUDOKU_ARCHIVE_START,
  nurikabe: NURIKABE_ARCHIVE_START,
  'killer-sudoku': KILLER_START,
}

export function LeaderboardsPage() {
  const [params, setParams] = useSearchParams()
  const [notice, setNotice] = useState<{ id: string; message: string } | null>(null)
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const today = useToday(timeZone)
  const requested = params.get('id') ?? today
  const parsed = puzzleIdParts(requested)
  const valid = parsed !== null && parsed.day <= today && parsed.day >= FIRST_DAY[parsed.type]
  const day = valid ? parsed.day : today, type = valid ? parsed.type : 'queens'
  const sudokuVariant = valid && type === 'sudoku' ? sudokuVariantOf(requested) : type === 'killer-sudoku' ? killerVariantOf(requested) : null
  const variant = valid && type === 'train-tracks' ? trackVariantOf(requested) : null
  const change = (nextType: PuzzleType, nextDay: string, size?: TrackSize | 'original', level?: SudokuLevel) => {
    if (!puzzleIdParts(nextDay) || nextDay > today) return
    const first = FIRST_DAY[nextType]
    if (first > today) {
      setNotice({ id: requested, message: `${PUZZLE_TYPE_LABEL[nextType]} puzzles are not available yet.` })
      return
    }
    const dayToShow = nextDay < first ? first : nextDay
    const originalAvailable = dayToShow >= ARCHIVE_START && dayToShow <= TRACK_LEGACY_END
    const keepOriginal = size === 'original' || (size === undefined && type === 'train-tracks' && variant === null)
    const chosen = nextType === 'train-tracks' && dayToShow >= TRACK_SIZES_ARCHIVE_START && !(originalAvailable && keepOriginal)
      ? (size === 'original' ? undefined : size) ?? variant?.name ?? 'small'
      : undefined
    const id = puzzleIdFor(dayToShow, nextType, chosen, (nextType === 'sudoku' || nextType === 'killer-sudoku') ? level ?? sudokuVariant?.name ?? 'easy' : undefined)
    setNotice(dayToShow === nextDay ? null : { id, message: `${PUZZLE_TYPE_LABEL[nextType]} starts on ${formatPuzzleLabel(first, timeZone)}. Showing the first available date.` })
    setParams({ id })
  }
  return <section className="leaderboards-page">
    <h1 className="page-title">Leaderboards</h1>
    <p className="page-intro">Compare the same puzzle. Fewer hints rank first, then time.</p>
    <div className="leaderboard-filters">
      <label>Game<select value={type} onChange={event => change(event.target.value as PuzzleType, day)}>{PUZZLE_TYPES.filter(game => PUZZLE_TYPE_PUBLISHED[game]).map(game => <option key={game} value={game}>{PUZZLE_TYPE_LABEL[game]}</option>)}</select></label>
      <label>Date<input type="date" value={day} min={FIRST_DAY[type]} max={today} onChange={event => change(type, event.target.value)} /></label>
      {(type === 'sudoku' || type === 'killer-sudoku') && <label>Level<select value={sudokuVariant?.name ?? 'easy'} onChange={event => change(type, day, undefined, event.target.value as SudokuLevel)}>
        {SUDOKU_VARIANTS.map(level => <option key={level.name} value={level.name}>{level.label}</option>)}
      </select></label>}
      {type === 'train-tracks' && <label>Size<select value={variant?.name ?? 'original'} onChange={event => change(type, day, event.target.value === 'original' ? 'original' : TRACK_VARIANTS.find(size => size.name === event.target.value)?.name)}>
        {(day <= TRACK_LEGACY_END || !variant) && <option value="original">Original</option>}
        {day >= TRACK_SIZES_ARCHIVE_START && TRACK_VARIANTS.map(size => <option key={size.name} value={size.name}>{size.label} · {size.side}×{size.side}</option>)}
      </select></label>}
    </div>
    {notice?.id === requested && <p className="status" role="status">{notice.message}</p>}
    {valid ? <><p><Link to={`/archive/${requested}`}>Play this puzzle ↗</Link></p><LeaderboardPanel key={requested} puzzleId={requested} /></> : <p className="status">Choose a published puzzle dated today or earlier.</p>}
    <p className="leaderboard-note">Timers count only while the puzzle page is visible and focused. Older results keep their recorded times. Times are compared only within the same puzzle.</p>
  </section>
}
