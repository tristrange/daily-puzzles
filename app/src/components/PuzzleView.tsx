import { SolvedPanel } from './SolvedPanel'
import { useLeaderboard } from '../lib/useLeaderboard'
import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
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
  piecesNeeded,
  toggleMark,
  toggleQueen,
  type GameState,
} from '../domain/game'
import { DIFFICULTY_LABEL, PUZZLE_PIECE, PUZZLE_TYPE_HAS_HINTS, PUZZLE_TYPE_LABEL } from '../domain/games'
import { hintCellName } from '../domain/hints'
import { checkedHint, type CheckedHint } from '../domain/checkedHints'
import type { Board } from '../domain/board'
import { isMarksPuzzle, isTracksPuzzle, isTrioPuzzle, isTentsPuzzle, type Puzzle } from '../domain/puzzle'
import { trackVariantOf } from '../domain/trackSizes'
import { TracksStage } from './TracksStage'
import { TrioStage } from './TrioStage'
import { TentsStage } from './TentsStage'
import { WordGrid } from '../domain/wordPaths'
import { PuzzleNotFoundError, PuzzleUnavailableError, loadPuzzle } from '../lib/puzzles'
import { readStoredStats, storeSolve, summarise, type SolveRecord, type Stats } from '../lib/stats'
import { readStoredAutoMark, storeAutoMark } from '../lib/autoMark'
import { clearMarksProgress, readMarksProgress, storeMarksProgress } from '../lib/marksProgress'
import { buildShareText, buildSolutionShareText, copyText, puzzleShareLink } from '../lib/share'
import { InteractiveBoard } from './InteractiveBoard'
import { HintPanel, MistakeWarning } from './HintPanel'
import { ResetButton } from './ResetButton'
import { useMoveHistory } from '../lib/useMoveHistory'

const WordPathsStage = lazy(() => import('./WordPathsStage').then((module) => ({ default: module.WordPathsStage })))

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; puzzle: Puzzle }
  | { status: 'error'; message: string }

/** Whether two states hold exactly the same pieces and marks. */
function sameState(a: GameState, b: GameState): boolean {
  if (a.queens.size !== b.queens.size || a.marks.size !== b.marks.size) return false
  for (const cell of a.queens) if (!b.queens.has(cell)) return false
  for (const cell of a.marks) if (!b.marks.has(cell)) return false
  return true
}

/**
 * The playing area for one loaded puzzle. Keyed by puzzle id so a different
 * puzzle starts a fresh attempt rather than inheriting the previous board.
 * An unfinished attempt is restored from local storage, without undo history.
 */
export function PuzzleStage({
  puzzle,
  board,
  timeZone,
}: {
  puzzle: Puzzle
  /** The marks board, narrowed once by the caller that chose this stage. */
  board: Board
  timeZone: string
}) {
  const [initialProgress] = useState(() => readMarksProgress(puzzle.id, board))
  const [game, setGame] = useState<GameState>(() => initialProgress?.game ?? createGame(board))
  const currentGame = useRef(game)
  const completed = useRef(false)
  const history = useMoveHistory<GameState>()
  const stage = useRef<HTMLDivElement>(null)
  const hintButton = useRef<HTMLButtonElement>(null)
  const hintId = useId()
  const [hint, setHint] = useState<CheckedHint | null>(null)
  const [mistakeWarning, setMistakeWarning] = useState(false)
  const hintReasons = useMemo(() => hint ? [hint.reason] : [], [hint])
  const [announcement, setAnnouncement] = useState('')
  const [autoMark, setAutoMark] = useState(readStoredAutoMark)
  const [solvedAt, setSolvedAt] = useState<number | null>(null)
  const [startedAt] = useState(() => Date.now() - (initialProgress?.elapsedMs ?? 0))
  const [elapsed, setElapsed] = useState(initialProgress?.elapsedMs ?? 0)
  const [savingAvailable, setSavingAvailable] = useState(true)
  // Hints actually shown, not hints asked for: a request that had nothing forced
  // to say is not help, and counting it would make the stat a measure of nerves.
  const hintsUsed = useRef(initialProgress?.hints ?? 0)
  // Set once this puzzle has been solved, so the banner can show what the solve
  // did to the history without re-reading storage on every render.
  const [stats, setStats] = useState<Stats | null>(null)
  // The solve already on record for this puzzle, if this was a replay.
  const [firstSolve, setFirstSolve] = useState<SolveRecord | null>(null)
  const [candidate, setCandidate] = useState<SolveRecord | null>(null)
  const { offerSolve } = useLeaderboard()
  const [copied, setCopied] = useState<'idle' | 'result' | 'solution' | 'failed'>('idle')
  // Set only when copying failed, so the text can be selected by hand.
  const [shareText, setShareText] = useState<string | null>(null)
  // The state a click-drag started from, so the whole stroke lands in history
  // as one step instead of one step per cell painted.
  const strokeStart = useRef<GameState | null>(null)

  // Save with the timer, and flush on the way out. The start is offset by the
  // saved duration, so a reload resumes from the same elapsed time rather than
  // counting the time the app was closed.
  useEffect(() => {
    if (solvedAt !== null) return
    const save = () => {
      if (completed.current) return
      setSavingAvailable(storeMarksProgress(
        puzzle.id, currentGame.current, Math.max(0, Date.now() - startedAt), hintsUsed.current,
      ))
    }
    const timer = setInterval(() => {
      setElapsed(Math.max(0, Date.now() - startedAt))
      save()
    }, 500)
    const flush = () => { save() }
    document.addEventListener('visibilitychange', flush)
    window.addEventListener('pagehide', flush)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', flush)
      window.removeEventListener('pagehide', flush)
      if (!completed.current) {
        storeMarksProgress(
          puzzle.id, currentGame.current, Math.max(0, Date.now() - startedAt), hintsUsed.current,
        )
      }
    }
  }, [puzzle.id, solvedAt, startedAt])

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
  const piecePlural = PUZZLE_PIECE[puzzle.puzzleType].plural

  const solved = isSolved(game)
  const shownTime = solvedAt === null ? elapsed : solvedAt - startedAt

  const announce = (message: string) => {
    setAnnouncement(message)
    resetHint()
  }

  const resetHint = () => {
    setHint(null)
    setMistakeWarning(false)
  }

  const recordSolve = (when: number) => {
    completed.current = true
    clearMarksProgress(puzzle.id)
    setSolvedAt(when)
    // Read before storing, so a replay can be told why its time was not kept.
    const earlier = readStoredStats().find((record) => record.id === puzzle.id)
    // Recorded once, at the moment it happens, and never revised: a replay is
    // played knowing the answer, so its time would flatter the record.
    const record: SolveRecord = { id: puzzle.id, puzzleType: puzzle.puzzleType, size: board.size,
      elapsedMs: when - startedAt, hints: hintsUsed.current, solvedAt: when }
    setStats(summarise(storeSolve(record), puzzleOfToday(new Date(when), timeZone)))
    if (!earlier) { setCandidate(record); offerSolve(record) }
    setFirstSolve(earlier ?? null)
    setAnnouncement(`Solved in ${formatTime(when - startedAt)}!`)
  }

  const applyGame = (next: GameState, before: GameState = game) => {
    if (sameState(next, before)) return
    history.remember(before)
    currentGame.current = next
    setGame(next)
    resetHint()
    if (solvedAt === null && isSolved(next)) {
      recordSolve(Date.now())
      return
    }
    setSavingAvailable(storeMarksProgress(
      puzzle.id, next, Math.max(0, Date.now() - startedAt), hintsUsed.current,
    ))
  }

  const beginStroke = () => {
    resetHint()
    strokeStart.current = game
  }

  /** Live feedback while dragging: no history, the stroke is not over yet. */
  const paintCell = (cell: number, target: 'mark' | 'empty') => {
    const next = paintStroke(currentGame.current, cell, target)
    currentGame.current = next
    setGame(next)
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
      if (!sameState(before, currentGame.current)) applyGame(currentGame.current, before)
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
    if (solved || strokeStart.current !== null) return
    const previous = history.undo(game)
    if (previous === undefined) return
    currentGame.current = previous
    setGame(previous)
    resetHint()
    setAnnouncement('Undid the last move.')
    setSavingAvailable(storeMarksProgress(
      puzzle.id, previous, Math.max(0, Date.now() - startedAt), hintsUsed.current,
    ))
  }

  const redo = () => {
    if (solved || strokeStart.current !== null) return
    const next = history.redo(game)
    if (next === undefined) return
    currentGame.current = next
    setGame(next)
    resetHint()
    setAnnouncement('Redid the last move.')
    setSavingAvailable(storeMarksProgress(
      puzzle.id, next, Math.max(0, Date.now() - startedAt), hintsUsed.current,
    ))
  }

  /**
   * Every piece and mark off the board at once.
   *
   * Routed through `applyGame`, so the state on screen becomes one step of history
   * and a single Undo brings the whole board back after confirmation. It also
   * clears the hint panel so it cannot describe a board that no longer exists.
   *
   * The clock is untouched. Elapsed time is measured from when the attempt
   * began, so a reset mid-attempt leaves the timer running — the work already
   * done was still done, and a reset is a correction rather than a new attempt.
   */
  const reset = () => {
    if (solved || strokeStart.current !== null || isEmpty(game)) return
    applyGame(resetGame(game))
    setAnnouncement('Board cleared. Undo brings it back.')
  }

  const showHint = (next: CheckedHint) => {
    setMistakeWarning(false)
    setHint(next)
    hintsUsed.current += 1
    setSavingAvailable(storeMarksProgress(
      puzzle.id, currentGame.current, Math.max(0, Date.now() - startedAt), hintsUsed.current,
    ))
    const position = hintCellName(board, next.cell)
    setAnnouncement(
      next.action === 'clear'
        ? `Hint: clear ${position}. ${next.reason}`
        : next.action === 'queen'
        ? `Hint: place a ${piece} at ${position}.`
        : `Hint: ${position} is dead — mark it.`,
    )
  }

  const requestHint = () => {
    if (!hintsAvailable || solved || strokeStart.current !== null) return
    const result = checkedHint(game)
    if (result.kind === 'unverified') {
      announce('Could not verify a unique solution within the hint check. No correction or deduction was made.')
      return
    }
    if (result.kind === 'none') {
      // The same count the win check uses; anything less is a stalled position.
      if (game.queens.size === piecesNeeded(board)) {
        announce(`All ${piecePlural} are placed.`)
      } else {
        announce('These rules found no further deduction. This does not prove that guessing is necessary.')
      }
      return
    }
    if (result.hint.action === 'clear') {
      setHint(null)
      setMistakeWarning(true)
      setAnnouncement('Your entries lead to a contradiction. Check them or choose Show the mistake.')
      return
    }
    showHint(result.hint)
  }

  const revealMistake = () => {
    if (solved || strokeStart.current !== null) return
    const result = checkedHint(currentGame.current)
    if (result.kind !== 'hint' || result.hint.action !== 'clear') { resetHint(); return }
    showHint(result.hint)
  }

  const dismissHint = () => { resetHint(); hintButton.current?.focus({ preventScroll: true }) }
  const showHintCell = () => {
    const cell = stage.current?.querySelector<HTMLElement>('[data-hint="target"]')
    cell?.focus({ preventScroll: true })
    cell?.scrollIntoView({ block: 'center' })
  }
  const acceptHint = () => {
    if (!hint || solved || strokeStart.current !== null) return
    const result = checkedHint(game)
    const latest = result.kind === 'hint' ? result.hint : null
    if (!latest || latest.cell !== hint.cell || latest.action !== hint.action || latest.rule !== hint.rule) {
      dismissHint()
      return
    }
    const next = hint.action === 'clear' ? clearCell(game, hint.cell) : hint.action === 'queen'
      ? autoMark ? placeQueenAutoMark(game, hint.cell) : toggleQueen(game, hint.cell)
      : toggleMark(game, hint.cell)
    applyGame(next)
    if (isSolved(next)) {
      stage.current?.querySelector<HTMLElement>(`[data-cell="${hint.cell}"]`)?.focus({ preventScroll: true })
    } else {
      setAnnouncement('Hint applied. Undo brings back the previous board.')
      hintButton.current?.focus({ preventScroll: true })
    }
  }

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
    const counted = firstSolve ?? { elapsedMs: shownTime, hints: hintsUsed.current }
    const result = {
      puzzleId: puzzle.id,
      width: board.width,
      height: board.height,
      puzzleType: puzzle.puzzleType,
      elapsedMs: counted.elapsedMs,
      hints: counted.hints,
      streak: stats?.currentStreak ?? 0,
      link: puzzleShareLink(puzzle.id),
    }
    const text =
      variant === 'solution'
        ? buildSolutionShareText(result, board, game.queens)
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
    <div className="marks-game" ref={stage}>
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
        <button
          type="button"
          className="tool-button auto-mark"
          aria-pressed={autoMark}
          onClick={toggleAutoMark}
        >
          Auto-mark {autoMark ? 'on' : 'off'}
        </button>
        <ResetButton onReset={reset} disabled={isEmpty(game) || solved} />
        {hintsAvailable && (
          <button ref={hintButton} type="button" className="tool-button" onClick={requestHint} disabled={solved}
            aria-label="Get an explained hint" aria-expanded={hint !== null || mistakeWarning} aria-controls={hint || mistakeWarning ? hintId : undefined}>
            Hint
          </button>
        )}
      </div>
      {!savingAvailable && !solved && (
        <p className="status error" role="status">
          Progress can&rsquo;t be saved in this browser. Keep this page open to retain it.
        </p>
      )}
      <InteractiveBoard
        board={board}
        game={game}
        hint={hint}
        hintId={hint ? hintId : undefined}
        conflictCells={conflictCells}
        locked={solved}
        onToggleQueen={(cell) => {
          applyGame(autoMark ? placeQueenAutoMark(game, cell) : toggleQueen(game, cell))
        }}
        onToggleMark={(cell) => applyGame(toggleMark(game, cell))}
        onClear={(cell) => applyGame(clearCell(game, cell))}
        onRequestHint={requestHint}
        onUndo={undo}
        onRedo={redo}
        onGestureStart={beginStroke}
        onPaintCell={paintCell}
        onGestureEnd={endStroke}
      />
      <p className="hint-text">{statusText}</p>
      {mistakeWarning && <MistakeWarning id={hintId} onReveal={revealMistake} onDismiss={dismissHint} />}
      {hint && <HintPanel id={hintId} location={hintCellName(board, hint.cell)}
        title={hint.action === 'clear' ? hint.rule === 'wrong-piece' ? `Remove this ${piece}` : 'Clear this cross'
          : hint.action === 'queen' ? `Place a ${piece}` : `Rule out a ${piece}`}
        reasons={hintReasons} effect={hint.action === 'clear'
          ? 'Checked against the unique solution, independently of your other entries. Clears only this cell.'
          : `Your placed ${piecePlural} and crosses were checked against the unique solution before this deduction.`}
        onApply={acceptHint} onDismiss={dismissHint} onShowCell={showHintCell} />}
      <SolvedPanel solved={solved} firstSolve={firstSolve} streak={stats?.currentStreak ?? 0}
        copied={copied} shareText={shareText} onShare={share} puzzleId={puzzle.id} candidate={candidate} />
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  )
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
          error instanceof PuzzleUnavailableError
            ? error.message
            : error instanceof PuzzleNotFoundError
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
      <div className="puzzle-heading">
        <Link
          className="puzzle-rules"
          to={{ pathname: '/how-to-play', hash: `#${state.puzzle.puzzleType}` }}
          target="_blank"
          rel="noopener"
          aria-label={`${PUZZLE_TYPE_LABEL[state.puzzle.puzzleType]} rules (opens in a new tab)`}
        >Rules <span aria-hidden="true">↗</span></Link>
        <p className="eyebrow">{formatPuzzleLabel(id, timeZone)}</p>
        <h1>{PUZZLE_TYPE_LABEL[state.puzzle.puzzleType]}</h1>
        <p className="puzzle-detail">
          {isTracksPuzzle(state.puzzle) && trackVariantOf(id) && <>{trackVariantOf(id)!.label} · </>}
          {state.puzzle.board.width}&times;{state.puzzle.board.height} grid
          {state.puzzle.difficulty != null && <> · {DIFFICULTY_LABEL[state.puzzle.difficulty]}</>}
        </p>
      </div>
      <div key={state.puzzle.id}>
        {isTentsPuzzle(state.puzzle) ? (
          <TentsStage board={state.puzzle.board} puzzle={state.puzzle} />
        ) : isTrioPuzzle(state.puzzle) ? (
          <TrioStage board={state.puzzle.board} puzzle={state.puzzle} />
        ) : isTracksPuzzle(state.puzzle) ? (
          <TracksStage puzzle={state.puzzle} grid={state.puzzle.board} timeZone={timeZone} />
        ) : isMarksPuzzle(state.puzzle) ? (
          <PuzzleStage puzzle={state.puzzle} board={state.puzzle.board} timeZone={timeZone} />
        ) : state.puzzle.board instanceof WordGrid ? (
          <Suspense fallback={<p className="status">Loading word board…</p>}>
            <WordPathsStage puzzle={state.puzzle} grid={state.puzzle.board} timeZone={timeZone} />
          </Suspense>
        ) : null}
      </div>
    </article>
  )
}
