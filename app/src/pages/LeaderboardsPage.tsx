import { Link, useSearchParams } from 'react-router-dom'
import { PUZZLE_TYPES, type PuzzleType } from '../domain/board'
import { puzzleIdParts, puzzleIdFor } from '../domain/dates'
import { PUZZLE_TYPE_LABEL, PUZZLE_TYPE_PUBLISHED } from '../domain/games'
import { TRACK_SIZES_START, TRACK_VARIANTS, trackVariantOf, type TrackSize } from '../domain/trackSizes'
import { SUDOKU_START, SUDOKU_VARIANTS, sudokuVariantOf, KILLER_START, killerVariantOf } from '../domain/sudokuLevels'
import type { SudokuLevel } from '../domain/sudoku'
import { LeaderboardPanel } from '../components/LeaderboardPanel'
import { useToday } from '../lib/useToday'

export function LeaderboardsPage() {
  const [params, setParams] = useSearchParams()
  const today = useToday(Intl.DateTimeFormat().resolvedOptions().timeZone)
  const requested = params.get('id') ?? today
  const parsed = puzzleIdParts(requested)
  const valid = parsed !== null && parsed.day <= today && (parsed.type !== 'sudoku' || parsed.day >= SUDOKU_START) && (parsed.type !== 'killer-sudoku' || parsed.day >= KILLER_START)
  const day = valid ? parsed.day : today, type = valid ? parsed.type : 'queens'
  const sudokuVariant = valid && type === 'sudoku' ? sudokuVariantOf(requested) : type === 'killer-sudoku' ? killerVariantOf(requested) : null
  const variant = valid && type === 'train-tracks' ? trackVariantOf(requested) : null
  const change = (nextType: PuzzleType, nextDay: string, size?: TrackSize, level?: SudokuLevel) => {
    if (!puzzleIdParts(nextDay) || nextDay > today) return
    const chosen = nextType === 'train-tracks' && nextDay >= TRACK_SIZES_START ? size ?? variant?.name ?? 'small' : undefined
    if (nextType === 'sudoku' && nextDay < SUDOKU_START || nextType === 'killer-sudoku' && nextDay < KILLER_START) return
    setParams({ id: puzzleIdFor(nextDay, nextType, chosen, (nextType === 'sudoku' || nextType === 'killer-sudoku') ? level ?? sudokuVariant?.name ?? 'easy' : undefined) })
  }
  return <section className="leaderboards-page">
    <h1 className="page-title">Leaderboards</h1>
    <p className="page-intro">Compare the same puzzle. Fewer hints rank first, then time.</p>
    <div className="leaderboard-filters">
      <label>Game<select value={type} onChange={event => change(event.target.value as PuzzleType, day)}>{PUZZLE_TYPES.filter(game => PUZZLE_TYPE_PUBLISHED[game]).map(game => <option key={game} value={game}>{PUZZLE_TYPE_LABEL[game]}</option>)}</select></label>
      <label>Date<input type="date" value={day} max={today} onChange={event => change(type, event.target.value)} /></label>
      {(type === 'sudoku' || type === 'killer-sudoku') && <label>Level<select value={sudokuVariant?.name ?? 'easy'} onChange={event => change(type, day, undefined, event.target.value as SudokuLevel)}>
        {SUDOKU_VARIANTS.map(level => <option key={level.name} value={level.name}>{level.label}</option>)}
      </select></label>}
      {type === 'train-tracks' && <label>Size<select value={variant?.name ?? 'original'} onChange={event => change(type, day, event.target.value as TrackSize)}>
        {!variant && <option value="original">Original</option>}
        {day >= TRACK_SIZES_START && TRACK_VARIANTS.map(size => <option key={size.name} value={size.name}>{size.label} · {size.side}×{size.side}</option>)}
      </select></label>}
    </div>
    {valid ? <><p><Link to={`/archive/${requested}`}>Play this puzzle ↗</Link></p><LeaderboardPanel key={requested} puzzleId={requested} /></> : <p className="status">Choose a published puzzle dated today or earlier.</p>}
    <p className="leaderboard-note">Timers count only while the puzzle page is visible and focused. Older results keep their recorded times. Times are compared only within the same puzzle.</p>
  </section>
}
