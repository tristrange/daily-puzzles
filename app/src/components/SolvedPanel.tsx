/**
 * What a solved board shows: the banner, the two share buttons, and the
 * clipboard fallback.
 *
 * Extracted because it is pure presentation over facts both stages already hold,
 * and because the share buttons are the fiddliest markup in the app — a copy
 * button that silently does nothing is the worst kind, so the fallback textarea
 * has to sit next to it and the two share variants have to say which one gives
 * the puzzle away. None of that is marks-specific and none of it is
 * tracks-specific, so it is written once.
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { formatTime } from '../domain/game'
import { PUZZLE_TYPE_LABEL } from '../domain/games'
import { passportUnlocksForSolve } from '../lib/passport'
import { REGION_COLOURS } from '../lib/colours'
import { readStoredStats, type SolveRecord } from '../lib/stats'
import { LeaderboardPanel } from './LeaderboardPanel'

// The board's own palette, minus the two navies that would vanish on dark paper.
const CONFETTI_COLOURS = REGION_COLOURS.filter(colour => colour !== '#264653' && colour !== '#023047')

/** Deterministic, so a re-render does not re-roll the shower mid-fall. */
function scatter(n: number): number {
  const value = Math.sin(n * 12.9898) * 43758.5453
  return value - Math.floor(value)
}

/**
 * One shower of paper over the whole page when a puzzle is finished. A fixed
 * layer rather than a board-local burst: the board is not always the part of the
 * screen the player is looking at, and this way it needs no measuring. Every
 * piece is a single transform/opacity animation, and the layer is inert.
 */
function Confetti() {
  const [finished, setFinished] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setFinished(true), 2600)
    return () => clearTimeout(timer)
  }, [])
  if (finished) return null
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: 90 }, (_, index) => (
        <i
          key={index}
          style={{
            left: `${scatter(index + 1) * 100}%`,
            background: CONFETTI_COLOURS[index % CONFETTI_COLOURS.length],
            '--drift': `${(scatter(index + 2) - 0.5) * 150}px`,
            '--spin': `${(scatter(index + 3) - 0.5) * 900}deg`,
            animationDelay: `${scatter(index + 4) * 260}ms`,
            animationDuration: `${1200 + scatter(index + 5) * 700}ms`,
          } as CSSProperties}
        />
      ))}
    </div>
  )
}

export interface SolvedPanelProps {
  solved: boolean
  /** The solve already on record for this puzzle, if this was a replay. */
  firstSolve: SolveRecord | null
  streak: number
  copied: 'idle' | 'result' | 'solution' | 'failed'
  /** The share text, shown when the clipboard could not be reached. */
  shareText: string | null
  onShare: (variant: 'result' | 'solution') => void
  puzzleId?: string | undefined
  candidate?: SolveRecord | null
}

export function SolvedPanel({
  solved,
  firstSolve,
  streak,
  copied,
  shareText,
  onShare,
  puzzleId,
  candidate,
}: SolvedPanelProps) {
  const unlocks = useMemo(() => {
    if (!solved || firstSolve !== null || !candidate || puzzleId !== candidate.id) return []
    return passportUnlocksForSolve(readStoredStats(), candidate)
  }, [solved, firstSolve, candidate, puzzleId])
  // A page that opens already solved is a restore, not a completion: only a
  // change from unsolved while this panel was on screen earns the arrival.
  const [startedSolved] = useState(solved)
  // A board that fills the viewport puts the banner just below the fold, so the
  // arrival plays where nobody is looking. Bring it into view instead. `nearest`
  // moves the page only as far as it must, and an instant scroll stays safe
  // under reduced motion.
  const banner = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    if (startedSolved) return
    banner.current?.scrollIntoView({ block: 'nearest' })
  }, [solved, startedSolved])
  if (!solved) return null
  return (
    <div className={`solved-panel${startedSolved ? '' : ' just-solved'}`}>
      {!startedSolved && <Confetti />}
      <p className="solved-banner" ref={banner}>
        {firstSolve === null ? (
          <>
            Solved — nice!
            {streak > 1 && <> {streak}-day streak.</>}
          </>
        ) : (
          <>Solved again — your first solve, {formatTime(firstSolve.elapsedMs)}, still counts.</>
        )}
      </p>
      {unlocks.length > 0 && <div className="passport-celebration">
        {unlocks.map(unlock => <p key={unlock.kind}>
          {unlock.kind === 'explorer' ? 'Explorer stamp earned!' : unlock.milestone === 1
            ? `${PUZZLE_TYPE_LABEL[unlock.type]} stamp earned!`
            : `${unlock.milestone} ${PUZZLE_TYPE_LABEL[unlock.type]} puzzles solved!`}
        </p>)}
        <Link to="/stats/passport">View your passport <span aria-hidden="true">→</span></Link>
      </div>}
      <div className="share-buttons">
        <button type="button" className="tool-button share" onClick={() => onShare('result')}>
          {copied === 'result' ? 'Copied result' : 'Copy result'}
        </button>
        <button
          type="button"
          className="tool-button share"
          onClick={() => onShare('solution')}
          title="Includes the finished board — this one gives the puzzle away"
        >
          {copied === 'solution' ? 'Copied solution' : 'Copy with solution'}
        </button>
      </div>
      {shareText !== null && (
        <textarea
          className="share-text"
          readOnly
          rows={shareText.split('\n').length}
          aria-label="Share text"
          ref={(node) => {
            node?.select()
          }}
          onFocus={(event) => event.currentTarget.select()}
          value={shareText}
        />
      )}
      {puzzleId && <LeaderboardPanel puzzleId={puzzleId} candidate={candidate} />}
    </div>
  )
}
