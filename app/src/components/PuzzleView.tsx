import { useEffect, useMemo, useState } from 'react'
import { formatPuzzleLabel } from '../domain/dates'
import { conflicts, createGame, clearCell, toggleMark, toggleQueen, type GameState } from '../domain/game'
import { firstHint, type Hint } from '../domain/hints'
import type { Puzzle } from '../domain/puzzle'
import { PuzzleNotFoundError, loadPuzzle } from '../lib/puzzles'
import { InteractiveBoard } from './InteractiveBoard'

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; puzzle: Puzzle }
  | { status: 'error'; message: string }

/**
 * The playing area for one loaded puzzle. Keyed by puzzle id so the game state
 * starts fresh whenever a different puzzle is shown.
 */
function PuzzleStage({ puzzle }: { puzzle: Puzzle }) {
  const [game, setGame] = useState<GameState>(() => createGame(puzzle.board))
  const [hint, setHint] = useState<Hint | null>(null)
  const [announcement, setAnnouncement] = useState('')

  const conflictList = useMemo(() => conflicts(game), [game])
  const conflictCells = useMemo(() => {
    const cellSet = new Set<number>()
    for (const conflict of conflictList) {
      cellSet.add(conflict.cells[0])
      cellSet.add(conflict.cells[1])
    }
    return cellSet
  }, [conflictList])

  const resetHint = () => {
    setHint(null)
  }

  const announce = (message: string) => {
    setAnnouncement(message)
    setHint(null)
  }

  const requestHint = () => {
    if (conflictList.length > 0) {
      announce('Remove the conflicting queen before asking for a hint.')
      return
    }
    const next = firstHint(puzzle.board, game.queens, game.marks)
    if (next === null) {
      if (game.queens.size === puzzle.board.size) {
        announce('All queens are placed.')
      } else {
        announce('No forced move right now — try placing a queen somewhere.')
      }
      return
    }
    setHint(next)
    const position = describeCell(puzzle.board, next.cell)
    setAnnouncement(
      next.action === 'queen'
        ? `Hint: place a queen at ${position}.`
        : `Hint: ${position} is dead — mark it.`,
    )
  }

  const hintText =
    hint === null
      ? null
      : hint.action === 'queen'
        ? `Place a queen at ${describeCell(puzzle.board, hint.cell)}.`
        : `Mark ${describeCell(puzzle.board, hint.cell)} — it cannot hold a queen.`

  return (
    <>
      <InteractiveBoard
        board={puzzle.board}
        game={game}
        hint={hint}
        conflictCells={conflictCells}
        onToggleQueen={(cell) => {
          setGame((current) => toggleQueen(current, cell))
          resetHint()
        }}
        onToggleMark={(cell) => {
          setGame((current) => toggleMark(current, cell))
          resetHint()
        }}
        onClear={(cell) => {
          setGame((current) => clearCell(current, cell))
          resetHint()
        }}
        onRequestHint={requestHint}
      />
      <div className="controls" aria-label="Puzzle tools">
        <button type="button" className="hint-button" onClick={requestHint}>
          Hint
        </button>
        <p className="hint-text">{hintText ?? (
            conflictList.length > 0 ? 'Two queens are in conflict — fix them.' : ' '
          )}</p>
        <p className="meta">
          {puzzle.board.size}×{puzzle.board.size} queens puzzle
        </p>
      </div>
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