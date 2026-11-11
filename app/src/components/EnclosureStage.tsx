import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { createEnclosureGame, enclosureFingerprint, evaluate, resetEnclosure, toggleWall, type EnclosureGame, type EnclosureGrid } from '../domain/enclosure'
import type { Puzzle } from '../domain/puzzle'
import { readEnclosureProgress, storeEnclosureProgress } from '../lib/enclosureProgress'
import { validatedEnclosureBest, validatedEnclosureFirst, type EnclosureBest } from '../lib/enclosureResults'
import type { EnclosureSolution } from '../lib/enclosureSolution'
import { useLeaderboard } from '../lib/useLeaderboard'
import { readStoredStats, storeEnclosureResult, type SolveRecord } from '../lib/stats'
import { historyCommand, useMoveHistory } from '../lib/useMoveHistory'
import type { PlayTime } from '../lib/playTime'
import { usePlayClock } from '../lib/usePlayClock'
import { EnclosureBoard } from './EnclosureBoard'
import { PlayTimer } from './PlayTimer'
import { ResetButton } from './ResetButton'
import { useEnclosureSolution } from '../lib/useEnclosureSolution'
import { LeaderboardPanel } from './LeaderboardPanel'

type Submission = { status: 'unsubmitted' } | { status: 'preview' } | { status: 'daily'; record: SolveRecord }

export function EnclosureStage({ grid, puzzle, previewId = '2000-01-01-enclosure', previewSolution }: { grid: EnclosureGrid; puzzle?: Puzzle; previewId?: string; previewSolution?: EnclosureSolution }) {
  const id = puzzle?.id ?? previewId
  const [initial] = useState(() => readEnclosureProgress(id, grid))
  const [first] = useState(() => puzzle ? readStoredStats().find(record => record.id === id && record.puzzleType === 'enclosure') : undefined)
  const [game, setGame] = useState(() => initial?.game ?? createEnclosureGame(grid))
  const current = useRef(game)
  const [best, setBest] = useState<EnclosureBest | null>(() => puzzle ? validatedEnclosureBest(first, grid) : initial?.previewBest ?? null)
  const bestRef = useRef(best)
  const [submission, setSubmission] = useState<Submission>(() => first ? { status: 'daily', record: first }
    : !puzzle && initial?.previewBest ? { status: 'preview' } : { status: 'unsubmitted' })
  const completed = submission.status !== 'unsubmitted'
  const firstRecord = submission.status === 'daily' ? submission.record : undefined
  const history = useMoveHistory<EnclosureGame>()
  const [pending, setPending] = useState<SolveRecord | null>(null)
  const [saving, setSaving] = useState(true), [statsSaving, setStatsSaving] = useState(true), [message, setMessage] = useState('')
  const instructionsId = useId()
  const boardSlot = useRef<HTMLDivElement>(null)
  const [boardLimit, setBoardLimit] = useState<number>()
  useLayoutEffect(() => {
    const measure = () => {
      if (!boardSlot.current) return
      const top = boardSlot.current.getBoundingClientRect().top + window.scrollY
      // Keep a usable minimum when zoom or a very short window requires scrolling.
      setBoardLimit(Math.max(224, window.innerHeight - top - 8))
    }
    let frame = 0
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure) }
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
    observer?.observe(document.body)
    window.addEventListener('resize', schedule)
    measure()
    return () => { observer?.disconnect(); window.removeEventListener('resize', schedule); cancelAnimationFrame(frame) }
  }, [])
  const optimal = useEnclosureSolution({ id, grid, canReveal: completed, ...(previewSolution ? { provided: previewSolution } : {}) })
  const overlay = completed && optimal.view.status === 'open' ? optimal.view.solution : null
  const { offerSolve } = useLeaderboard()
  const saveProgress = (value: PlayTime) => storeEnclosureProgress(id, current.current, value, puzzle ? undefined : bestRef.current ?? undefined)
  const initialTime = first ? { elapsedMs: first.elapsedMs, ...(first.attemptElapsedMs === undefined ? {} : { attemptElapsedMs: first.attemptElapsedMs }) } : initial ?? { elapsedMs: 0 }
  const { time, settle, stop, restartAttempt } = usePlayClock(initialTime, value => {
    setSaving(saveProgress(value))
  })
  useEffect(() => { if (completed) stop() }, [completed, stop])
  const save = () => setSaving(saveProgress(settle()))
  const change = (next: EnclosureGame) => { current.current = next; setGame(next); save() }
  const toggle = (cell: number) => {
    const next = toggleWall(current.current, cell)
    if (next === current.current) { setMessage('No walls remaining. Remove a wall before placing another.'); return }
    history.remember(current.current); change(next); setMessage('')
  }
  const undo = () => { const next = history.undo(current.current); if (next) { change(next); setMessage('Undid the last move.') } }
  const redo = () => { const next = history.redo(current.current); if (next) { change(next); setMessage('Redid the last move.') } }
  const reset = () => {
    const next = resetEnclosure(current.current)
    if (next === current.current) return
    restartAttempt(); history.remember(current.current); change(next); setMessage('Board cleared. Undo restores it.')
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (overlay) return
    if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [data-readonly="true"]')) return
    const command = historyCommand(event.nativeEvent)
    if (command) { event.preventDefault(); if (command === 'undo') undo(); else redo() }
  }
  const result = evaluate(grid, game.walls)
  const saveResult = (record: SolveRecord) => {
    const merged = storeEnclosureResult(record, grid).find(entry => entry.id === id)
    const saved = readStoredStats().find(entry => entry.id === id)
    const mergedBest = validatedEnclosureBest(merged, grid)
    const savedBest = validatedEnclosureBest(saved, grid)
    const candidate = validatedEnclosureBest(record, grid)
    const verified = !!candidate && !!savedBest && savedBest.score >= candidate.score && saved?.solvedAt === merged?.solvedAt && saved?.elapsedMs === merged?.elapsedMs && saved?.attemptElapsedMs === merged?.attemptElapsedMs
    bestRef.current = mergedBest; setBest(mergedBest)
    setStatsSaving(verified); setPending(verified ? null : record)
    setSubmission({ status: 'daily', record: merged ?? record })
    return merged ?? record
  }
  const submit = () => {
    if (overlay || result.escaped || (best && result.score <= best.score)) return
    const when = Date.now()
    const firstSubmission = !completed
    const stoppedTime = firstSubmission ? stop() : settle()
    const candidate: EnclosureBest = { score: result.score, walls: [...game.walls], board: enclosureFingerprint(grid), achievedAt: when }
    if (puzzle) {
      const record: SolveRecord = { ...(firstRecord ?? { id, puzzleType: 'enclosure', size: grid.size, ...stoppedTime, hints: 0, solvedAt: when, enclosureFirst: candidate }), enclosureBest: candidate }
      const savedRecord = saveResult(record)
      if (firstSubmission) void offerSolve(savedRecord)
    } else { bestRef.current = candidate; setBest(candidate); setSubmission({ status: 'preview' }) }
    setSaving(saveProgress(stoppedTime))
    setMessage('Enclosure submitted. You can keep editing to improve your score.')
  }
  const ranked = validatedEnclosureFirst(firstRecord, grid)
  const shown = overlay ? evaluate(grid, overlay.walls) : result
  const shownWalls = overlay?.walls ?? game.walls
  const solutionLabel = optimal.view.status === 'loading' ? 'Loading optimal solution…' : overlay ? 'Hide optimal solution' : optimal.view.status === 'error' ? 'Retry optimal solution' : 'Show optimal solution'
  return <div className="enclosure-stage" onKeyDown={onKeyDown}>
    <div className="enclosure-workspace">
      <div className="enclosure-controls">
        <PlayTimer time={time} />
        <button type="button" className="tool-button" onClick={undo} disabled={!!overlay || !history.canUndo}>Undo</button>
        <button type="button" className="tool-button" onClick={redo} disabled={!!overlay || !history.canRedo}>Redo</button>
        <ResetButton onReset={reset} disabled={!!overlay || game.walls.length === 0} />
      </div>
      <div className="enclosure-scores">
        <span>Score: <strong>{shown.score}</strong></span><span>Best score: <strong>{best?.score ?? '—'}</strong></span>
        <span>Optimal score: <strong>{grid.optimalScore ?? '—'}</strong></span>
        <span aria-label={`${shownWalls.length} of ${grid.wallBudget} walls used; ${grid.wallBudget - shownWalls.length} remaining`}>Walls left: <strong>{grid.wallBudget - shownWalls.length}<small>/{grid.wallBudget}</small></strong></span>
      </div>
      <div className="enclosure-actions" role="group" aria-label="Enclosure actions">
        <button type="button" className="tool-button primary" aria-label={best ? 'Save best score' : 'Submit enclosure'} disabled={!!overlay || result.escaped || (best !== null && result.score <= best.score)} onClick={submit}>{best ? 'Save best' : 'Submit'}</button>
        {completed && grid.optimalScore !== null && <button type="button" className="tool-button" aria-label={solutionLabel} aria-disabled={optimal.view.status === 'loading'} aria-busy={optimal.view.status === 'loading'} aria-expanded={!!overlay} onClick={optimal.toggle}>
          {optimal.view.status === 'loading' ? 'Loading…' : overlay ? 'Hide optimal' : optimal.view.status === 'error' ? 'Retry optimal' : 'Show optimal'}
        </button>}
        {puzzle && !completed && <small className="enclosure-first-note">First score ranks</small>}
      </div>
      <p id={instructionsId} className="enclosure-instructions">{overlay ? 'Optimal solution · Read-only' : `${result.escaped ? 'Escaping' : 'Enclosed'} · Tap grass to toggle walls.`}<span className="sr-only">{overlay ? ' Arrow keys explore the cells.' : ' Arrow keys move; Enter or Space toggles.'}</span></p>
      <div ref={boardSlot} className="enclosure-board-slot" style={{ maxWidth: boardLimit }}>
        {overlay ? <EnclosureBoard grid={grid} walls={overlay.walls} reachable={shown.reachable} enclosed instructionsId={instructionsId} readOnly label="Optimal enclosure solution" />
          : <EnclosureBoard grid={grid} walls={game.walls} reachable={result.reachable} enclosed={!result.escaped} instructionsId={instructionsId} onToggle={toggle} />}
      </div>
    </div>
    <p className="enclosure-status" aria-live="polite">{overlay ? `Optimal solution: ${shown.score} cells. Read-only; hide it to return to your attempt.` : result.escaped ? `The horse can escape. Reachable area: ${result.reachable.length}.` : `Enclosed! Reachable area: ${result.reachable.length}.`}</p>
    {puzzle && <p className="enclosure-status">{ranked ? `First submitted score: ${ranked.score}. Only your first score and time count for the leaderboard; improvements are personal.` : completed ? 'Your original score was not recorded for ranking. You can keep improving your personal best.' : 'Your first submitted score and time are final for the leaderboard. You can improve your personal best afterward.'}</p>}
    {message && <p className="enclosure-status" role="status">{message}</p>}
    {!saving && <p className="enclosure-status" role="alert">Could not save the current board on this device.</p>}
    {!statsSaving && <p className="enclosure-status" role="alert">Could not save your submitted score on this device.</p>}
    {pending && <button type="button" className="tool-button" onClick={() => saveResult(pending)}>Retry saving score</button>}
    {grid.optimalScore !== null && <p className="enclosure-status" role="status">{optimal.saved ? completed ? 'Optimal solution available offline.' : 'Optimal solution available offline after submitting.' : overlay ? 'This solution is available for this visit, but could not be saved for offline viewing.' : 'Optimal solution not saved for offline viewing yet.'}</p>}
    {optimal.view.status === 'error' && <p className="enclosure-status" role="alert">Could not load a verified optimal solution. Connect to the internet and try again.</p>}
    {puzzle && <LeaderboardPanel puzzleId={id} candidate={ranked ? firstRecord : null} />}
  </div>
}
