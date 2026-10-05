import { useEffect, useMemo, useRef, useState } from 'react'
import { formatPuzzleLabel, puzzleOfToday } from '../domain/dates'
import {
  clearCell,
  conflicts,
  createGame,
  cycleCell,
  formatTime,
  isEmpty,
  isSolved,
  nextCellState,
  paintStroke,
  placeQueenAutoMark,
  resetGame,
  toggleMark,
  toggleQueen,
  type GameState,
} from '../domain/game'
import { PUZZLE_PIECE, PUZZLE_TYPE_HAS_HINTS } from '../domain/games'
import { firstHint, type Hint } from '../domain/hints'
import type { Puzzle } from '../domain/puzzle'
import { PuzzleNotFoundError, loadPuzzle } from '../lib/puzzles'
import { readStoredStats, storeSolve, summarise, type SolveRecord, type Stats } from '../lib/stats'
import { readStoredAutoMark, storeAutoMark } from '../lib/autoMark'
import { buildShareText, buildSolutionShareText, copyText, puzzleShareLink } from '../lib/share'
import { InteractiveBoard } from './InteractiveBoard'

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; puzzle: Puzzle }
  | { status: 'error'; message: string }

/** Keep the most recent moves so undo is bounded and cheap. */
const HISTORY_LIMIT = 100

/** Whether two states hold exactly the same pieces and marks. */
function sameState(a: GameState, b: GameState): boolean {
  if (a.queens.size !== b.queens.size || a.marks.size !== b.marks.size) return false
  for (const cell of a.queens) if (!b.queens.has(cell)) return false
  for (const cell of a.marks) if (!b.marks.has(cell)) return false
  return true
}

/**
 * The playing area for one loaded puzzle. Keyed by puzzle id so the game state
 * (board, timer, undo history) starts fresh whenever a different puzzle is
 * shown.
 */
function PuzzleStage({ puzzle, timeZone }: { puzzle: Puzzle; timeZone: string }) {
  const [game, setGame] = useState<GameState>(() => createGame(puzzle.board))
  const [history, setHistory] = useState<GameState[]>([])
  const [hint, setHint] = useState<Hint | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [autoMark, setAutoMark] = useState(readStoredAutoMark)
  const [solvedAt, setSolvedAt] = useState<number | null>(null)
  const [startedAt] = useState(() => Date.now())
  const [elapsed, setElapsed] = useState(0)
  // Hints actually shown, not hints asked for: a request that had nothing forced
  // to say is not help, and counting it would make the stat a measure of nerves.
  const [hintsUsed, setHintsUsed] = useState(0)
  // Set once this puzzle has been solved, so the banner can show what the solve
  // did to the history without re-reading storage on every render.
  const [stats, setStats] = useState<Stats | null>(null)
  // The solve already on record for this puzzle, if this was a replay.
  const [firstSolve, setFirstSolve] = useState<SolveRecord | null>(null)
  const [copied, setCopied] = useState<'idle' | 'result' | 'solution' | 'failed'>('idle')
  // Set only when copying failed, so the text can be selected by hand.
  const [shareText, setShareText] = useState<string | null>(null)
  // The state a click-drag started from, so the whole stroke lands in history
  // as one step instead of one step per cell painted.
  const strokeStart = useRef<GameState | null>(null)

  useEffect(() => {
    if (solvedAt !== null) return
    const timer = setInterval(() => {
      setElapsed(Date.now() - startedAt)
    }, 500)
    return () => clearInterval(timer)
  }, [solvedAt, startedAt])

  const conflictList = useMemo(() => conflicts(game), [game])
  const conflictCells = useMemo(() => {
    const cellSet = new Set<number>()
    for (const conflict of conflictList) {
      cellSet.add(conflict.cells[0])
      cellSet.add(conflict.cells[1])
    }
    return cellSet
  }, [conflictList])

  // Whether this family has a hint engine, and what its pieces are called, both read
  // from the registry rather than branched on: the hint engine is a Queens port, and a
  // family without one plays without hints rather than with wrong ones (see `firstHint`).
  const hintsAvailable = PUZZLE_TYPE_HAS_HINTS[puzzle.puzzleType]
  const piece = PUZZLE_PIECE[puzzle.puzzleType].noun

  const solved = isSolved(game)
  const shownTime = solvedAt === null ? elapsed : solvedAt - startedAt

  const announce = (message: string) => {
    setAnnouncement(message)
    setHint(null)
  }

  const resetHint = () => {
    setHint(null)
  }

  const applyGame = (next: GameState, before: GameState = game) => {
    setHistory((past) => [...past.slice(1 - HISTORY_LIMIT), before])
    setGame(next)
    resetHint()
    if (solvedAt === null && isSolved(next)) {
      const when = Date.now()
      setSolvedAt(when)
      // Read before storing, so a replay can be told why its time was not kept.
      const earlier = readStoredStats().find((record) => record.id === puzzle.id)
      // Recorded once, at the moment it happens, and never revised: a replay is
      // played knowing the answer, so its time would flatter the record.
      setStats(
        summarise(
          storeSolve({
            id: puzzle.id,
            puzzleType: puzzle.puzzleType,
            size: puzzle.board.size,
            elapsedMs: when - startedAt,
            hints: hintsUsed,
            solvedAt: when,
          }),
          puzzleOfToday(new Date(when), timeZone),
        ),
      )
      setFirstSolve(earlier ?? null)
      setAnnouncement(`Solved in ${formatTime(when - startedAt)}!`)
    }
  }

  const beginStroke = () => {
    strokeStart.current = game
  }

  /** Live feedback while dragging: no history, the stroke is not over yet. */
  const paintCell = (cell: number, target: 'mark' | 'empty') => {
    setGame((current) => paintStroke(current, cell, target))
  }

  /**
   * A press that never became a drag is a click, and the board has already
   * painted its first cell, so the cycle is applied from the pre-press snapshot
   * instead of from the live state. A real drag is already on screen and just
   * needs committing.
   */
  const endStroke = (clickedCell: number | null) => {
    const before = strokeStart.current
    strokeStart.current = null
    if (before === null) return
    if (clickedCell === null) {
      // A stroke that painted cells already in the target state changed nothing,
      // and an undo step that appears to do nothing is worse than no step.
      if (!sameState(before, game)) applyGame(game, before)
      return
    }
    const placing = nextCellState(before, clickedCell) === 'queen'
    const next =
      placing && autoMark ? placeQueenAutoMark(before, clickedCell) : cycleCell(before, clickedCell)
    applyGame(next, before)
  }

  /**
   * Stored on the way out rather than inside the state updater: updaters must be
   * pure, and React is free to run one twice in development.
   */
  const toggleAutoMark = () => {
    const next = !autoMark
    setAutoMark(next)
    storeAutoMark(next)
  }

  const undo = () => {
    const previous = history[history.length - 1]
    if (previous === undefined) return
    setHistory(history.slice(0, -1))
    setGame(previous)
    resetHint()
    setAnnouncement('Undid the last move.')
  }

  /**
   * Every piece and mark off the board at once.
   *
   * Routed through `applyGame`, so the state on screen becomes one step of history
   * and a single Undo brings the whole board back. That is why this needs no
   * confirmation: the thing stats-clearing asks twice about is the one that cannot
   * be undone, and this can. It also keeps the hint panel from still describing a
   * board that no longer exists.
   *
   * The clock is untouched. Elapsed time is measured from when the puzzle was
   * opened, so a reset mid-attempt leaves the timer running — the work already done
   * was still done, and a reset is a correction rather than a new attempt.
   */
  const reset = () => {
    if (isEmpty(game)) return
    applyGame(resetGame(game))
    setAnnouncement('Board cleared. Undo brings it back.')
  }

  const requestHint = () => {
    if (!hintsAvailable) return
    if (conflictList.length > 0) {
      announce(`Remove the conflicting ${piece} before asking for a hint.`)
      return
    }
    const next = firstHint(puzzle.board, game.queens, game.marks)
    if (next === null) {
      if (game.queens.size === puzzle.board.size) {
        announce('All queens are placed.')
      } else {
        announce(`No forced move right now — try placing a ${piece} somewhere.`)
      }
      return
    }
    setHint(next)
    setHintsUsed((count) => count + 1)
    const position = describeCell(puzzle.board, next.cell)
    setAnnouncement(
      next.action === 'queen'
        ? `Hint: place a ${piece} at ${position}.`
        : `Hint: ${position} is dead — mark it.`,
    )
  }

  const hintText =
    hint === null
      ? null
      : hint.action === 'queen'
        ? `Place a ${piece} at ${describeCell(puzzle.board, hint.cell)}.`
        : `Mark ${describeCell(puzzle.board, hint.cell)} — it cannot hold a ${piece}.`

  /**
   * Copy a share, optionally with the solution on it.
   *
   * The plain one is the default because a share is a challenge: it reports how
   * the solve went, and the board is the one thing that would do the
   * recipient's work for them. The board version is a separate, named choice
   * rather than a flag, for showing a solution to someone who has already
   * finished it.
   *
   * The time and hints come from the record that was just written, not from the
   * live clock, so sharing a replay reports the solve that actually counts. If
   * both copy paths fail the text is shown instead, selected and ready: a copy
   * that silently fails is the worst kind, because the player walks away
   * believing they have something to paste.
   */
  const share = async (variant: 'result' | 'solution') => {
    const counted = firstSolve ?? { elapsedMs: shownTime, hints: hintsUsed }
    const result = {
      size: puzzle.board.size,
      puzzleType: puzzle.puzzleType,
      elapsedMs: counted.elapsedMs,
      hints: counted.hints,
      streak: stats?.currentStreak ?? 0,
      link: puzzleShareLink(puzzle.id),
    }
    const text =
      variant === 'solution'
        ? buildSolutionShareText(result, puzzle.board, game.queens)
        : buildShareText(result)
    const ok = await copyText(text)
    setCopied(ok ? variant : 'failed')
    if (ok) {
      setShareText(null)
      setAnnouncement(
        variant === 'solution'
          ? 'Share text with the solution copied — that one gives the puzzle away.'
          : 'Share text copied to the clipboard.',
      )
      return
    }
    setShareText(text)
    setAnnouncement('Could not reach the clipboard — the share text is shown below, ready to copy.')
  }

  const statusText = solved
    ? `Solved in ${formatTime(shownTime)}`
    : conflictList.length > 0
      ? `Two ${piece}s are in conflict — fix them.`
      : ' '

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
          className="tool-button auto-mark"
          aria-pressed={autoMark}
          onClick={toggleAutoMark}
        >
          Auto-mark {autoMark ? 'on' : 'off'}
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
        {hintsAvailable && (
          <button type="button" className="tool-button" onClick={requestHint} disabled={solved}>
            Hint
          </button>
        )}
      </div>
      <InteractiveBoard
        board={puzzle.board}
        game={game}
        hint={hint}
        conflictCells={conflictCells}
        locked={solved}
        onToggleQueen={(cell) => {
          applyGame(autoMark ? placeQueenAutoMark(game, cell) : toggleQueen(game, cell))
        }}
        onToggleMark={(cell) => applyGame(toggleMark(game, cell))}
        onClear={(cell) => applyGame(clearCell(game, cell))}
        onRequestHint={requestHint}
        onUndo={undo}
        onGestureStart={beginStroke}
        onPaintCell={paintCell}
        onGestureEnd={endStroke}
      />
      <p className="hint-text">{hintText ?? statusText}</p>
      {solved && (
        <div className="solved-panel">
          <p className="solved-banner">
            {firstSolve === null ? (
              <>
                Solved — nice!
                {stats !== null && stats.currentStreak > 1 && (
                  <> {stats.currentStreak}-day streak.</>
                )}
              </>
            ) : (
              <>
                Solved again — your first solve, {formatTime(firstSolve.elapsedMs)}, still counts.
              </>
            )}
          </p>
          <div className="share-buttons">
            <button
              type="button"
              className="tool-button share"
              onClick={() => share('result')}
            >
              {copied === 'result' ? 'Copied result' : 'Copy result'}
            </button>
            <button
              type="button"
              className="tool-button share"
              onClick={() => share('solution')}
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
      )}
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </>
  )
}

function describeCell(board: Puzzle['board'], cell: number): string {
  const { row, col } = board.coords(cell)
  return `row ${row + 1}, column ${col + 1}`
}

export function PuzzleView({
  id,
  notFoundMessage,
}: {
  id: string
  /** Shown instead of the raw miss when this puzzle may simply not be out yet. */
  notFoundMessage?: string
}) {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    loadPuzzle(id).then(
      (puzzle) => {
        if (!cancelled) setState({ status: 'ready', puzzle })
      },
      (error: unknown) => {
        if (cancelled) return
        const message =
          error instanceof PuzzleNotFoundError
            ? (notFoundMessage ?? error.message)
            : 'Something went wrong loading that puzzle.'
        setState({ status: 'error', message })
      },
    )
    return () => {
      cancelled = true
    }
  }, [id, notFoundMessage])

  if (state.status === 'loading') {
    return <p className="status">Loading puzzle…</p>
  }
  if (state.status === 'error') {
    return <p className="status error">{state.message}</p>
  }
  return (
    <article className="puzzle">
      <h1>{formatPuzzleLabel(id, timeZone)}</h1>
      <div key={state.puzzle.id}>
        <PuzzleStage puzzle={state.puzzle} timeZone={timeZone} />
      </div>
    </article>
  )
}