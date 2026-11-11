import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
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
import { EnclosureSolutionPanel } from './EnclosureSolutionPanel'
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
    if (result.escaped || (best && result.score <= best.score)) return
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
  return <div className="enclosure-stage" onKeyDown={onKeyDown}>
    <div className="enclosure-controls">
      <PlayTimer time={time} />
      <button type="button" className="tool-button" onClick={undo} disabled={!history.canUndo}>Undo</button>
      <button type="button" className="tool-button" onClick={redo} disabled={!history.canRedo}>Redo</button>
      <ResetButton onReset={reset} disabled={game.walls.length === 0} />
    </div>
    <div className="enclosure-scores">
      <span>Current score: <strong>{result.score}</strong></span><span>Best score: <strong>{best?.score ?? '—'}</strong></span>
      <span>Optimal score: <strong>{grid.optimalScore ?? '—'}</strong></span>
    </div>
    <p className="enclosure-budget">Walls used: {game.walls.length} / {grid.wallBudget} · {grid.wallBudget - game.walls.length} remaining</p>
    <p id={instructionsId} className="enclosure-status">Tap grass to toggle walls. Arrow keys move; Enter or Space toggles.</p>
    <EnclosureBoard grid={grid} walls={game.walls} reachable={result.reachable} enclosed={!result.escaped} instructionsId={instructionsId} onToggle={toggle} />
    <p className="enclosure-status" aria-live="polite">{result.escaped ? `The horse can escape. Reachable area: ${result.reachable.length}.` : `Enclosed! Reachable area: ${result.reachable.length}.`}</p>
    {puzzle && <p className="enclosure-status">{ranked ? `First submitted score: ${ranked.score}. Only your first score and time count for the leaderboard; improvements are personal.` : completed ? 'Your original score was not recorded for ranking. You can keep improving your personal best.' : 'Your first submitted score and time are final for the leaderboard. You can improve your personal best afterward.'}</p>}
    <button type="button" className="tool-button" disabled={result.escaped || (best !== null && result.score <= best.score)} onClick={submit}>{best ? 'Save improved score' : 'Submit enclosure'}</button>
    {message && <p className="enclosure-status" role="status">{message}</p>}
    {!saving && <p className="enclosure-status" role="alert">Could not save the current board on this device.</p>}
    {!statsSaving && <p className="enclosure-status" role="alert">Could not save your submitted score on this device.</p>}
    {pending && <button type="button" className="tool-button" onClick={() => saveResult(pending)}>Retry saving score</button>}
    {grid.optimalScore !== null && <EnclosureSolutionPanel id={id} grid={grid} canReveal={completed} {...(previewSolution ? { provided: previewSolution } : {})} />}
    {puzzle && <LeaderboardPanel puzzleId={id} candidate={ranked ? firstRecord : null} />}
  </div>
}
