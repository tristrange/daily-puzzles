/**
 * The Train Tracks playing area.
 *
 * Separate from the marks stage rather than a second branch inside it, because
 * almost nothing is shared: there are no marks to cross out, no auto-mark (a
 * piece rules out nothing on its own — the whole question is what its neighbour
 * does back), and no hints. The clock, undo and reset are a few lines each and
 * are duplicated rather than hoisted, because hoisting them means a generic over
 * two unrelated state types to share code that is mostly `setState`.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatTime } from '../domain/game'
import type { Puzzle } from '../domain/puzzle'
import type { TrackGrid } from '../domain/tracks'
import {
  clearCell,
  createTracksGame,
  cyclePiece,
  isEmpty,
  isTracksSolved,
  resetGame,
  isFault,
  trackConflicts,
  type TracksGame,
} from '../domain/tracksGame'
import { readStoredStats, storeSolve, summarise, type SolveRecord, type Stats } from '../lib/stats'
import { puzzleOfToday } from '../domain/dates'
import {
  buildShareText,
  buildSolutionShareText,
  copyText,
  puzzleShareLink,
  type ShareResult,
} from '../lib/share'
import { TracksBoard } from './TracksBoard'
import { SolvedPanel } from './SolvedPanel'

export function TracksStage({
  puzzle,
  grid,
  timeZone,
}: {
  puzzle: Puzzle
  grid: TrackGrid
  timeZone: string
}) {
  const [game, setGame] = useState<TracksGame>(() => createTracksGame(grid))
  const [history, setHistory] = useState<TracksGame[]>([])
  const [announcement, setAnnouncement] = useState('')
  const [solvedAt, setSolvedAt] = useState<number | null>(null)
  const [startedAt] = useState(() => Date.now())
  const [elapsed, setElapsed] = useState(0)
  const [stats, setStats] = useState<Stats | null>(null)
  const [firstSolve, setFirstSolve] = useState<SolveRecord | null>(null)
  const [copied, setCopied] = useState<'idle' | 'result' | 'solution' | 'failed'>('idle')
  const [shareText, setShareText] = useState<string | null>(null)

  useEffect(() => {
    if (solvedAt !== null) return
    const timer = setInterval(() => setElapsed(Date.now() - startedAt), 500)
    return () => clearInterval(timer)
  }, [solvedAt, startedAt])

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
    // A no-op records nothing. `cyclePiece` and `clearCell` both return the
    // state unchanged for a given, and clearing an empty cell does the same, so a
    // click on a given would otherwise enable Undo and displace a real move from
    // the bounded history — and an Undo that appears to do nothing is worse than
    // no Undo at all. The marks board has the same rule in `endStroke`.
    if (next === before) return
    setHistory((past) => [...past.slice(1 - HISTORY_LIMIT), before])
    setGame(next)
    if (solvedAt !== null || !isTracksSolved(next)) return
    recordSolve(Date.now())
  }

  const undo = () => {
    const previous = history[history.length - 1]
    if (previous === undefined) return
    setHistory(history.slice(0, -1))
    setGame(previous)
    setAnnouncement('Undid the last move.')
  }

  const reset = () => {
    if (isEmpty(game)) return
    applyGame(resetGame(game))
    setAnnouncement('Board cleared. Undo brings it back.')
  }

  const share = async (variant: 'result' | 'solution') => {
    const counted = firstSolve ?? { elapsedMs: shownTime, hints: 0 }
    const result: ShareResult = {
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

  return (
    <>
      <div className="puzzle-tools">
        <span className="timer" role="timer" aria-label="Elapsed time">
          {formatTime(shownTime)}
        </span>
        <button
          type="button"
          className="tool-button"
          onClick={undo}
          disabled={history.length === 0 || solved}
          aria-label="Undo last move"
        >
          Undo
        </button>
        <button
          type="button"
          className="tool-button"
          onClick={reset}
          disabled={isEmpty(game) || solved}
          title="Clears the board. The clock keeps running, and Undo brings it all back."
        >
          Reset
        </button>
      </div>
      <TracksBoard
        grid={grid}
        game={game}
        conflicts={conflictList}
        locked={solved}
        onCycle={(cell) => applyGame(cyclePiece(game, cell))}
        onClear={(cell) => applyGame(clearCell(game, cell))}
        onUndo={undo}
      />
      <p className="hint-text">
        {solved
          ? `Solved in ${formatTime(shownTime)}`
          : conflictList.length > 0
            ? 'Some track does not meet — fix it.'
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

const HISTORY_LIMIT = 100
