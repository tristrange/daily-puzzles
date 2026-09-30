import { useEffect, useState } from 'react'
import { formatPuzzleLabel } from '../domain/dates'
import type { Puzzle } from '../domain/puzzle'
import { PuzzleNotFoundError, loadPuzzle } from '../lib/puzzles'
import { PuzzleBoard } from './PuzzleBoard'

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; puzzle: Puzzle }
  | { status: 'error'; message: string }

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
      <PuzzleBoard puzzle={state.puzzle} />
      <p className="meta">
        {state.puzzle.board.size}×{state.puzzle.board.size} queens puzzle
      </p>
    </article>
  )
}