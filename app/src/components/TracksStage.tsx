/**
 * The Train Tracks playing area.
 *
 * Separate from the marks stage rather than a second branch inside it, because
 * almost nothing is shared: no auto-mark (a piece rules out nothing on its own —
 * the whole question is what its neighbour does back), no hints, and a different
 * set of things a click can leave behind. The clock, undo and reset are a few
 * lines each and are duplicated rather than hoisted, because hoisting them means a
 * generic over two unrelated state types to share code that is mostly `setState`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatTime } from '../domain/game'
import type { Puzzle } from '../domain/puzzle'
import type { TrackGrid } from '../domain/tracks'
import {
  applyBrush,
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
  const history = useMoveHistory<TracksGame>()
  const [announcement, setAnnouncement] = useState('')
  const [solvedAt, setSolvedAt] = useState<number | null>(null)
  const [startedAt] = useState(() => Date.now() - (initialProgress?.elapsedMs ?? 0))
  const [elapsed, setElapsed] = useState(initialProgress?.elapsedMs ?? 0)
  const [savingAvailable, setSavingAvailable] = useState(true)
  const [stats, setStats] = useState<Stats | null>(null)
  const [firstSolve, setFirstSolve] = useState<SolveRecord | null>(null)
  const [copied, setCopied] = useState<'idle' | 'result' | 'solution' | 'failed'>('idle')
  const [shareText, setShareText] = useState<string | null>(null)
  // What a click puts in a cell. Kept here rather than inside the board because
  // the picker and the board are two controls over one choice, and neither owns it.
  const [brush, setBrush] = useState<TrackBrush>(1)
  const strokeStart = useRef<TracksGame | null>(null)
  const currentGame = useRef(game)
  const completed = useRef(false)

  useEffect(() => { currentGame.current = game }, [game])

  useEffect(() => {
    if (solvedAt !== null) return
    const save = () => storeTrackProgress(
      puzzle.id, currentGame.current, Math.max(0, Date.now() - startedAt),
    )
    const timer = setInterval(() => {
      setElapsed(Math.max(0, Date.now() - startedAt))
      setSavingAvailable(save())
    }, 500)
    const onPageHide = () => { if (!completed.current) save() }
    window.addEventListener('pagehide', onPageHide)
    return () => {
      clearInterval(timer)
      window.removeEventListener('pagehide', onPageHide)
      if (!completed.current) save()
    }
  }, [puzzle.id, solvedAt, startedAt])

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
  const shownTime = solvedAt === null ? elapsed : solvedAt - startedAt

  // The one place a solve is recorded, so a board that arrives already solved and
  // one the player finishes take the same path. Defensive today — the generator
  // never gives away a whole route, checked over 300 boards — but the failure it
  // prevents is silent: the board renders locked, the clock runs on, and nothing
  // is ever stored.
  const recordSolve = useCallback((when: number) => {
    completed.current = true
    clearTrackProgress(puzzle.id)
    setSolvedAt(when)
    // Read before storing, so a replay can be told why its time was not kept.
    const earlier = readStoredStats().find((record) => record.id === puzzle.id)
    setStats(
      summarise(
        storeSolve({
          id: puzzle.id,
          puzzleType: puzzle.puzzleType,
          // Stored as a single number because that is what the record has always
          // held and every published board is square. A rectangular grid records
          // its width; nothing reads the field, so nothing is misled.
          size: grid.width,
          elapsedMs: when - startedAt,
          hints: 0,
          solvedAt: when,
        }),
        puzzleOfToday(new Date(when), timeZone),
      ),
    )
    setFirstSolve(earlier ?? null)
    setAnnouncement(`Solved in ${formatTime(when - startedAt)}!`)
  }, [grid.width, puzzle.id, puzzle.puzzleType, startedAt, timeZone])

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
    history.remember(before)
    currentGame.current = next
    setGame(next)
    setSavingAvailable(storeTrackProgress(puzzle.id, next, Math.max(0, Date.now() - startedAt)))
    if (solvedAt !== null || !isTracksSolved(next)) return
    recordSolve(Date.now())
  }

  /** A press landed. The whole stroke, drag or click, is one move from here. */
  const beginStroke = () => {
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
    currentGame.current = previous
    setGame(previous)
    setSavingAvailable(storeTrackProgress(puzzle.id, previous, Math.max(0, Date.now() - startedAt)))
    setAnnouncement('Undid the last move.')
  }

  const redo = () => {
    if (solved || strokeStart.current !== null) return
    const next = history.redo(game)
    if (next === undefined) return
    currentGame.current = next
    setGame(next)
    setSavingAvailable(storeTrackProgress(puzzle.id, next, Math.max(0, Date.now() - startedAt)))
    setAnnouncement('Redid the last move.')
  }

  const reset = () => {
    if (solved || strokeStart.current !== null || isEmpty(game)) return
    applyGame(resetGame(game))
    setAnnouncement('Board cleared. Undo brings it back.')
  }

  const share = async (variant: 'result' | 'solution') => {
    const counted = firstSolve ?? { elapsedMs: shownTime, hints: 0 }
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
    <>
      <div className="tracks-workspace">
        <div className="tracks-controls">
          <div className="puzzle-tools">
            <span className="timer" role="timer" aria-label="Elapsed time">
              {formatTime(shownTime)}
            </span>
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
            : ' '}
      </p>
      <SolvedPanel
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
    </>
  )
}
