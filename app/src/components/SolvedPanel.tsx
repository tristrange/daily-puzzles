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

import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { formatTime } from '../domain/game'
import { PUZZLE_TYPE_LABEL } from '../domain/games'
import { passportUnlocksForSolve } from '../lib/passport'
import { readStoredStats, type SolveRecord } from '../lib/stats'
import { LeaderboardPanel } from './LeaderboardPanel'

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
  if (!solved) return null
  return (
    <div className="solved-panel">
      <p className="solved-banner">
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
