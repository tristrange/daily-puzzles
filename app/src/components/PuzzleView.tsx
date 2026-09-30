import { useEffect, useMemo, useState } from 'react'
import { formatPuzzleLabel } from '../domain/dates'
import {
  clearCell,
  conflicts,
  createGame,
  formatTime,
  isSolved,
  placeQueenAutoMark,
  toggleMark,
  toggleQueen,
  type GameState,
} from '../domain/game'
import { firstHint, type Hint } from '../domain/hints'
import type { Puzzle } from '../domain/puzzle'
import { PuzzleNotFoundError, loadPuzzle } from '../lib/puzzles'
import { InteractiveBoard } from './InteractiveBoard'

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; puzzle: Puzzle }
  | { status: 'error'; message: string }

/** Keep the most recent moves so undo is bounded and cheap. */
const HISTORY_LIMIT = 100

/**
 * The playing area for one loaded puzzle. Keyed by puzzle id so the game state
 * (board, timer, undo history) starts fresh whenever a different puzzle is
 * shown.
 */
function PuzzleStage({ puzzle }: { puzzle: Puzzle }) {
  const [game, setGame] = useState<GameState>(() => createGame(puzzle.board))
  const [history, setHistory] = useState<GameState[]>([])
  const [hint, setHint] = useState<Hint | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [autoMark, setAutoMark] = useState(false)
  const [solvedAt, setSolvedAt] = useState<number | null>(null)
  const [startedAt] = useState(() => Date.now())
  const [elapsed, setElapsed] = useState(0)

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

  const applyGame = (next: GameState) => {
    setHistory((past) => [...past.slice(1 - HISTORY_LIMIT), game])
    setGame(next)
    resetHint()
    if (solvedAt === null && isSolved(next)) {
      const when = Date.now()
      setSolvedAt(when)
      setAnnouncement(`Solved in ${formatTime(when - startedAt)}!`)
    }
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
      />
      <p className="hint-text">{hintText ?? statusText}</p>
      {solved && <p className="solved-banner">Solved — nice!</p>}
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
        <PuzzleStage puzzle={state.puzzle} />
      </div>
    </article>
  )
}