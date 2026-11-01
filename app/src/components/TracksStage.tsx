import { PlayTimer } from './PlayTimer'
import { useLeaderboard } from '../lib/useLeaderboard'
import { usePlayClock } from '../lib/usePlayClock'
/** Track pieces and directional rules need their own stage; controls and hint presentation are shared. */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { formatTime } from '../domain/game'
import type { Puzzle } from '../domain/puzzle'
import type { TrackGrid } from '../domain/tracks'
import {
  applyBrush,
  CROSS,
  MAYBE,
  TRACK_CELL_NAME,
  clearCell,
  createTracksGame,
  isEmpty,
  isTracksSolved,
  paintBrush,
  resetGame,
  isFault,
  type TrackBrush,
  type TrackConflict,
  trackConflicts,
  type TracksGame,
} from '../domain/tracksGame'
import { readStoredStats, storeSolve, summarise, type SolveRecord, type Stats } from '../lib/stats'
import { puzzleOfToday } from '../domain/dates'
import { clearTrackProgress, readTrackProgress, storeTrackProgress } from '../lib/trackProgress'
import {
  buildShareText,
  buildSolutionShareText,
  copyText,
  puzzleShareLink,
  type ShareResult,
} from '../lib/share'
import { TrackPicker } from './TrackPicker'
import { TracksBoard } from './TracksBoard'
import { SolvedPanel } from './SolvedPanel'
import { HintPanel } from './HintPanel'
import { applyTrackHint, findTrackHint, trackCellName, type TrackHint } from '../domain/trackHints'
import { ResetButton } from './ResetButton'
import { useMoveHistory } from '../lib/useMoveHistory'

export function TracksStage({
  puzzle,
  grid,
  timeZone,
}: {
  puzzle: Puzzle
  grid: TrackGrid
  timeZone: string
}) {
  const [initialProgress] = useState(() => readTrackProgress(puzzle.id, grid))
  const [game, setGame] = useState<TracksGame>(() => initialProgress?.game ?? createTracksGame(grid))
  const stage = useRef<HTMLDivElement>(null)
  const hintButton = useRef<HTMLButtonElement>(null)
  const hintId = useId()
  const [hint, setHint] = useState<TrackHint | null>(null)
  const [hintMessage, setHintMessage] = useState('')
  const hintReasons = useMemo(() => ({
    reasons: hint ? [hint.steps.at(-1)!.reason] : [],
    supportingReasons: hint?.steps.slice(0, -1).map((step) => step.reason) ?? [],
  }), [hint])
  const hintsUsed = useRef(initialProgress?.hints ?? 0)
  const clearHint = () => { setHint(null); setHintMessage('') }
  const history = useMoveHistory<TracksGame>()
  const [announcement, setAnnouncement] = useState('')
  const [solvedAt, setSolvedAt] = useState<number | null>(null)
  const [savingAvailable, setSavingAvailable] = useState(true)
  const [stats, setStats] = useState<Stats | null>(null)
  const [firstSolve, setFirstSolve] = useState<SolveRecord | null>(null)
  const [candidate, setCandidate] = useState<SolveRecord | null>(null)
  const { offerSolve } = useLeaderboard()
  const [copied, setCopied] = useState<'idle' | 'result' | 'solution' | 'failed'>('idle')
  const [shareText, setShareText] = useState<string | null>(null)
  // What a click puts in a cell. Kept here rather than inside the board because
  // the picker and the board are two controls over one choice, and neither owns it.
  const [brush, setBrush] = useState<TrackBrush>(1)
  const strokeStart = useRef<TracksGame | null>(null)
  const currentGame = useRef(game)
  const completed = useRef(false)

  useEffect(() => { currentGame.current = game }, [game])

  const { time, settle, stop, restartAttempt } = usePlayClock(initialProgress ?? { elapsedMs: 0 }, time => {
    setSavingAvailable(storeTrackProgress(puzzle.id, currentGame.current, time, hintsUsed.current))
  })
  const elapsed = time.elapsedMs

  // Nothing is flagged until the player has placed something. The givens are
  // pieces, and a given whose far end faces an empty cell is an unfinished board
  // rather than a mistake — but a red cell on load reads as "this puzzle is
  // broken", and the marks board never starts that way. The glyph says which way
  // an end is pointing, so the information is not lost; it is just not an alarm.
  const placed = !isEmpty(game)
  const conflictList = useMemo(
    () => (placed ? trackConflicts(game).filter((c) => isFault(c.rule)) : []),
    [game, placed],
  )
  const solved = isTracksSolved(game)
  const shownTime = elapsed

  // The one place a solve is recorded, so a board that arrives already solved and
  // one the player finishes take the same path. Defensive today — the generator
  // never gives away a whole route, checked over 300 boards — but the failure it
  // prevents is silent: the board renders locked, the clock runs on, and nothing
  // is ever stored.
  const recordSolve = useCallback((when: number) => {
    const stoppedTime = stop()
    completed.current = true
    clearTrackProgress(puzzle.id)
    setSolvedAt(when)
    // Read before storing, so a replay can be told why its time was not kept.
    const earlier = readStoredStats().find((record) => record.id === puzzle.id)
    const record: SolveRecord = { id: puzzle.id, puzzleType: puzzle.puzzleType, size: grid.width,
      ...stoppedTime, hints: hintsUsed.current, solvedAt: when }
    setStats(summarise(storeSolve(record), puzzleOfToday(new Date(when), timeZone)))
    if (!earlier) { setCandidate(record); offerSolve(record) }
    setFirstSolve(earlier ?? null)
    setAnnouncement(`Solved in ${formatTime(stoppedTime.elapsedMs)}!`)
  }, [grid.width, puzzle.id, puzzle.puzzleType, stop, timeZone, offerSolve])

  // Arrived already solved. `solvedAt` is the guard, exactly as it is for a
  // finished game, so this fires once and never again.
  useEffect(() => {
    if (solvedAt !== null || !isTracksSolved(game)) return
    recordSolve(Date.now())
  }, [solvedAt, game, recordSolve])

  const applyGame = (next: TracksGame, before: TracksGame = game) => {
    // A no-op records nothing. `applyBrush` and `clearCell` both return the state
    // unchanged for a given, and either brush over an already-empty cell does the
    // same, so a click on a given would otherwise enable Undo and displace a real
    // move from the bounded history — and an Undo that appears to do nothing is
    // worse than no Undo at all. The marks board has the same rule in `endStroke`.
    if (next === before) return
    clearHint()
    history.remember(before)
    currentGame.current = next
    setGame(next)
    setSavingAvailable(storeTrackProgress(puzzle.id, next, settle(), hintsUsed.current))
    if (solvedAt !== null || !isTracksSolved(next)) return
    recordSolve(Date.now())
  }

  /** A press landed. The whole stroke, drag or click, is one move from here. */
  const beginStroke = () => {
    clearHint()
    strokeStart.current = game
  }

  /** Live feedback while dragging: no history, the stroke is not over yet. */
  const paint = (cell: number, withBrush: TrackBrush) => {
    setGame((current) => paintBrush(current, cell, withBrush))
  }

  /**
   * A press that never became a drag is a click, and the board has already painted
   * its first cell, so the brush is applied from the pre-press snapshot instead of
   * from the live state. A real drag is already on screen and just needs
   * committing.
   */
  const endStroke = (clickedCell: number | null, withBrush: TrackBrush) => {
    const before = strokeStart.current
    strokeStart.current = null
    if (before === null) return
    if (clickedCell === null) {
      // A stroke over cells already holding what the brush puts there changed
      // nothing, and `applyGame` drops the no-op rather than the history.
      applyGame(game, before)
      return
    }
    applyGame(applyBrush(before, clickedCell, withBrush), before)
  }

  const undo = () => {
    if (solved || strokeStart.current !== null) return
    const previous = history.undo(game)
    if (previous === undefined) return
    clearHint()
    currentGame.current = previous
    setGame(previous)
    setSavingAvailable(storeTrackProgress(puzzle.id, previous, settle(), hintsUsed.current))
    setAnnouncement('Undid the last move.')
  }

  const redo = () => {
    if (solved || strokeStart.current !== null) return
    const next = history.redo(game)
    if (next === undefined) return
    clearHint()
    currentGame.current = next
    setGame(next)
    setSavingAvailable(storeTrackProgress(puzzle.id, next, settle(), hintsUsed.current))
    setAnnouncement('Redid the last move.')
  }

  const reset = () => {
    if (solved || strokeStart.current !== null || isEmpty(game)) return
    restartAttempt()
    applyGame(resetGame(game))
    setAnnouncement('Board cleared. Undo brings it back.')
  }

  const requestHint = () => {
    if (completed.current || solved || strokeStart.current !== null) return
    const result = findTrackHint(currentGame.current)
    setHint(result.kind === 'hint' ? result.hint : null)
    const message = result.kind === 'contradiction'
      ? 'Your tracks and crosses lead to a contradiction. Check your entries or Undo before asking for a hint.'
      : result.kind === 'none' ? 'These hint techniques found no further deduction. This does not prove that guessing is necessary.' : ''
    setHintMessage(message)
    setAnnouncement(message)
    if (result.kind === 'hint') {
      hintsUsed.current += 1
      setSavingAvailable(storeTrackProgress(puzzle.id, currentGame.current, settle(), hintsUsed.current))
    }
  }
  const dismissHint = () => { clearHint(); hintButton.current?.focus({ preventScroll: true }) }
  const showHintCell = () => {
    const target = stage.current?.querySelector<HTMLElement>('[data-hint="target"]')
    target?.focus({ preventScroll: true })
    target?.scrollIntoView({ block: 'center' })
  }
  const acceptHint = () => {
    if (!hint || completed.current || solved || strokeStart.current !== null) return
    const before = currentGame.current, next = applyTrackHint(before, hint)
    if (next === before) { dismissHint(); return }
    applyGame(next, before)
    if (isTracksSolved(next)) stage.current?.querySelector<HTMLElement>(`[data-cell="${hint.cell}"]`)?.focus({ preventScroll: true })
    else { setAnnouncement('Hint applied. Undo restores your previous board.'); hintButton.current?.focus({ preventScroll: true }) }
  }

  const share = async (variant: 'result' | 'solution') => {
    const counted = firstSolve ?? { elapsedMs: shownTime, hints: hintsUsed.current }
    const result: ShareResult = {
      puzzleId: puzzle.id,
      width: grid.width,
      height: grid.height,
      puzzleType: puzzle.puzzleType,
      elapsedMs: counted.elapsedMs,
      hints: counted.hints,
      streak: stats?.currentStreak ?? 0,
      link: puzzleShareLink(puzzle.id),
    }
    const text =
      variant === 'solution'
        ? buildSolutionShareText(result, grid, game.pieces)
        : buildShareText(result)
    const ok = await copyText(text)
    setCopied(ok ? variant : 'failed')
    if (!ok) {
      setShareText(text)
      setAnnouncement('Could not reach the clipboard — the share text is shown below, ready to copy.')
      return
    }
    setShareText(null)
    setAnnouncement(
      variant === 'solution'
        ? 'Share text with the solution copied — that one gives the puzzle away.'
        : 'Share text copied to the clipboard.',
    )
  }

  // Said in terms of the rules that actually fired. One message for all of them
  // would send a player to fix joins when the board is joined and a clue is
  // wrong, which is the same fault-naming mistake the per-cell labels had.
  const statusTextFor = (faults: readonly TrackConflict[]): string => {
    const joins = faults.some((f) => f.rule === 'mismatched-end')
    const counts = faults.some((f) => f.rule === 'row-count' || f.rule === 'col-count')
    if (joins && counts) return 'Some track does not meet, and a line is over its count.'
    if (joins) return 'Some track does not meet — fix it.'
    if (counts) return 'A line holds more than its count — clear a track or undecided cell.'
    return 'Too many track ends run off the grid.'
  }

  return (
    <div className="tracks-game" ref={stage}>
      <div className="tracks-workspace">
        <div className="tracks-controls">
          <div className="puzzle-tools">
            <PlayTimer time={time} />
            <button
              type="button"
              className="tool-button"
              onClick={undo}
              disabled={!history.canUndo || solved}
              aria-label="Undo last move"
            >
              Undo
            </button>
            <button type="button" className="tool-button" onClick={redo}
              disabled={!history.canRedo || solved} aria-label="Redo last move">Redo</button>
            <ResetButton onReset={reset} disabled={isEmpty(game) || solved} />
            <button ref={hintButton} type="button" className="tool-button" onClick={requestHint}
              disabled={solved} aria-label="Get an explained hint" aria-expanded={hint !== null}
              aria-controls={hint ? hintId : undefined}>Hint</button>
          </div>
          {!savingAvailable && !solved && (
            <p className="status error" role="status">
              Progress can&rsquo;t be saved in this browser. Keep this page open to retain it.
            </p>
          )}
          <TrackPicker brush={brush} onPick={setBrush} disabled={solved} />
        </div>
        <TracksBoard
          grid={grid}
          game={game}
          hint={hint}
          hintId={hint ? hintId : undefined}
          onRequestHint={requestHint}
          conflicts={conflictList}
          locked={solved}
          brush={brush}
          onBrush={(cell, withBrush) => applyGame(applyBrush(game, cell, withBrush))}
          onClear={(cell) => applyGame(clearCell(game, cell))}
          onUndo={undo}
          onRedo={redo}
          onGestureStart={beginStroke}
          onPaint={paint}
          onGestureEnd={endStroke}
        />
      </div>
      <p className="hint-text">
        {solved
          ? `Solved in ${formatTime(shownTime)}`
          : conflictList.length > 0
            ? statusTextFor(conflictList)
            : hintMessage || ' '}
      </p>
      {hint && <HintPanel id={hintId} location={trackCellName(grid, hint.cell)}
        title={hint.brush === CROSS ? 'Rule out track' : hint.brush === MAYBE ? 'Mark definite track' : `Place ${TRACK_CELL_NAME[hint.brush]}`}
        reasons={hintReasons.reasons} supportingReasons={hintReasons.supportingReasons} effect={`${hint.brush === MAYBE ? 'Apply puts ? in this cell. It counts as track; choose its direction later. ' : ''}Uses your placed tracks, ? cells and crosses as starting assumptions.`}
        onApply={acceptHint} onDismiss={dismissHint} onShowCell={showHintCell} />}
      <SolvedPanel
        puzzleId={puzzle.id} candidate={candidate}
        solved={solved}
        firstSolve={firstSolve}
        streak={stats?.currentStreak ?? 0}
        copied={copied}
        shareText={shareText}
        onShare={share}
      />
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  )
}
