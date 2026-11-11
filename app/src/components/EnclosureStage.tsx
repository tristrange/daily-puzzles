import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { createEnclosureGame, enclosureFingerprint, evaluate, resetEnclosure, toggleWall, type EnclosureGame, type EnclosureGrid } from '../domain/enclosure'
import type { Puzzle } from '../domain/puzzle'
import { readEnclosureProgress, storeEnclosureProgress } from '../lib/enclosureProgress'
import { validatedEnclosureBest, type EnclosureBest } from '../lib/enclosureResults'
import { readStoredStats, storeEnclosureResult, type SolveRecord } from '../lib/stats'
import { historyCommand, useMoveHistory } from '../lib/useMoveHistory'
import { usePlayClock } from '../lib/usePlayClock'
import { EnclosureBoard } from './EnclosureBoard'
import { PlayTimer } from './PlayTimer'
import { ResetButton } from './ResetButton'

export function EnclosureStage({ grid, puzzle, previewId = '2000-01-01-enclosure' }: { grid: EnclosureGrid; puzzle?: Puzzle; previewId?: string }) {
  const id = puzzle?.id ?? previewId
  const [initial] = useState(() => readEnclosureProgress(id, grid))
  const [first] = useState(() => puzzle ? readStoredStats().find(record => record.id === id && record.puzzleType === 'enclosure') : undefined)
  const [game, setGame] = useState(() => initial?.game ?? createEnclosureGame(grid))
  const current = useRef(game)
  const [best, setBest] = useState<EnclosureBest | null>(() => validatedEnclosureBest(first, grid))
  const completed = useRef(first !== undefined)
  const firstRecord = useRef(first)
  const history = useMoveHistory<EnclosureGame>()
  const [saving, setSaving] = useState(true), [statsSaving, setStatsSaving] = useState(true), [message, setMessage] = useState('')
  const instructionsId = useId()
  const { time, settle, stop, restartAttempt } = usePlayClock(initial ?? { elapsedMs: first?.elapsedMs ?? 0 }, value => {
    setSaving(storeEnclosureProgress(id, current.current, value))
  })
  useEffect(() => { if (completed.current) stop() }, [stop])
  const save = () => setSaving(storeEnclosureProgress(id, current.current, settle()))
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
    const command = historyCommand(event.nativeEvent)
    if (command) { event.preventDefault(); if (command === 'undo') undo(); else redo() }
  }
  const result = evaluate(grid, game.walls)
  const submit = () => {
    if (result.escaped || (best && result.score <= best.score)) return
    const when = Date.now()
    const stoppedTime = completed.current ? settle() : stop()
    completed.current = true
    const candidate: EnclosureBest = { score: result.score, walls: [...game.walls], board: enclosureFingerprint(grid), achievedAt: when }
    if (puzzle) {
      const record: SolveRecord = { ...(firstRecord.current ?? { id, puzzleType: 'enclosure', size: grid.size, ...stoppedTime, hints: 0, solvedAt: when }), enclosureBest: candidate }
      firstRecord.current = record
      const merged = storeEnclosureResult(record, grid).find(entry => entry.id === id)
      const saved = readStoredStats().find(entry => entry.id === id)
      const mergedBest = validatedEnclosureBest(merged, grid)
      const savedBest = validatedEnclosureBest(saved, grid)
      setBest(mergedBest); setStatsSaving(!!savedBest && savedBest.score >= candidate.score && saved?.solvedAt === merged?.solvedAt)
    } else setBest(candidate)
    setSaving(storeEnclosureProgress(id, current.current, stoppedTime))
    setMessage('Enclosure submitted. You can keep editing to improve your score.')
  }
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
    <button type="button" className="tool-button" disabled={result.escaped || (best !== null && result.score <= best.score)} onClick={submit}>{best ? 'Save improved score' : 'Submit enclosure'}</button>
    {message && <p className="enclosure-status" role="status">{message}</p>}
    {!saving && <p className="enclosure-status" role="alert">Could not save the current board on this device.</p>}
    {!statsSaving && <p className="enclosure-status" role="alert">Could not save your submitted score on this device.</p>}
  </div>
}
