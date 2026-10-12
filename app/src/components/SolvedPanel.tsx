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

import { formatTime } from '../domain/game'
import type { SolveRecord } from '../lib/stats'

export interface SolvedPanelProps {
  solved: boolean
  /** The solve already on record for this puzzle, if this was a replay. */
  firstSolve: SolveRecord | null
  streak: number
  copied: 'idle' | 'result' | 'solution' | 'failed'
  /** The share text, shown when the clipboard could not be reached. */
  shareText: string | null
  onShare: (variant: 'result' | 'solution') => void
}

export function SolvedPanel({
  solved,
  firstSolve,
  streak,
  copied,
  shareText,
  onShare,
}: SolvedPanelProps) {
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
    </div>
  )
}