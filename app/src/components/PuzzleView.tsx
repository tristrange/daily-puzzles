import { useEffect, useMemo, useRef, useState } from 'react'
import { formatPuzzleLabel, puzzleOfToday } from '../domain/dates'
import {
  clearCell,
  conflicts,
  createGame,
  cycleCell,
  formatTime,
  isSolved,
  nextCellState,
  placeQueenAutoMark,
  setCell,
  toggleMark,
  toggleQueen,
  type GameState,
} from '../domain/game'
import { firstHint, type Hint } from '../domain/hints'
import type { Puzzle } from '../domain/puzzle'
import { PuzzleNotFoundError, loadPuzzle } from '../lib/puzzles'
import { storeSolve, summarise, type Stats } from '../lib/stats'
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
  const [autoMark, setAutoMark] = useState(false)
  const [solvedAt, setSolvedAt] = useState<number | null>(null)
  const [startedAt] = useState(() => Date.now())
  const [elapsed, setElapsed] = useState(0)
  // Hints actually shown, not hints asked for: a request that had nothing forced
  // to say is not help, and counting it would make the stat a measure of nerves.
  const [hintsUsed, setHintsUsed] = useState(0)
  // Set once this puzzle has been solved, so the banner can show what the solve
  // did to the history without re-reading storage on every render.
  const [stats, setStats] = useState<Stats | null>(null)
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

  // The hint engine is a Queens port; a Star Battle board plays without hints
  // rather than with wrong ones (see `firstHint`).
  const hintsAvailable = puzzle.board.puzzleType === 'queens'
  const piece = puzzle.board.puzzleType === 'queens' ? 'queen' : 'star'

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
      // Recorded once, at the moment it happens, and never revised: a replay
      // cannot restate when a day was first solved.
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
      setAnnouncement(`Solved in ${formatTime(when - startedAt)}!`)
    }
  }

  const beginStroke = () => {
    strokeStart.current = game
  }

  /** Live feedback while dragging: no history, the stroke is not over yet. */
  const paintCell = (cell: number, target: 'mark' | 'empty') => {
    setGame((current) => setCell(current, cell, target))
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

  const undo = () => {
    const previous = history[history.length - 1]
    if (previous === undefined) return
    setHistory(history.slice(0, -1))
    setGame(previous)
    resetHint()
    setAnnouncement('Undid the last move.')
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
          onClick={() => setAutoMark((current) => !current)}
        >
          Auto-mark {autoMark ? 'on' : 'off'}
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
        <p className="solved-banner">
          Solved — nice!
          {stats !== null && stats.currentStreak > 1 && (
            <> {stats.currentStreak}-day streak.</>
          )}
        </p>
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

export function PuzzleView({ id }: { id: string }) {
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
            ? error.message
            : 'Something went wrong loading that puzzle.'
        setState({ status: 'error', message })
      },
    )
    return () => {
      cancelled = true
    }
  }, [id])

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