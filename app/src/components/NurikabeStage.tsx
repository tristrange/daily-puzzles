import { useId, useRef, useState } from 'react'
import { createNurikabeGame, editNurikabeCell, isNurikabeSolved, nurikabeConflicts, type NurikabeBoard as Board, type NurikabeGame, type NurikabeMark } from '../domain/nurikabe'
import { formatTime } from '../domain/game'
import { readNurikabeProgress, storeNurikabeProgress } from '../lib/nurikabeProgress'
import { useMoveHistory } from '../lib/useMoveHistory'
import { usePlayClock } from '../lib/usePlayClock'
import { ResetButton } from './ResetButton'
import { NurikabeBoard } from './NurikabeBoard'
import './Nurikabe.css'

export function NurikabeStage({ board }: { board: Board }) {
  const [initial] = useState(() => readNurikabeProgress(board))
  const [game, setGame] = useState(() => initial?.game ?? createNurikabeGame(board))
  const current = useRef(game), before = useRef<NurikabeGame | null>(null), completed = useRef(false)
  const [solved, setSolved] = useState(false), [saving, setSaving] = useState(true), [message, setMessage] = useState('')
  const [brush, setBrush] = useState<NurikabeMark>(1)
  const history = useMoveHistory<NurikabeGame>(), instructionsId = useId(), pickerId = useId()
  const conflicts = nurikabeConflicts(board, game)
  const { elapsed, settle, stop } = usePlayClock(initial?.elapsedMs ?? 0, time => {
    setSaving(storeNurikabeProgress(board, before.current ?? current.current, time))
  })
  const save = () => setSaving(storeNurikabeProgress(board, current.current, settle()))
  const change = (next: NurikabeGame) => { current.current = next; setGame(next) }
  const begin = () => { if (!completed.current) before.current = current.current }
  const apply = (cell: number, value: NurikabeMark) => {
    if (!completed.current) { change(editNurikabeCell(board, current.current, cell, value)); setMessage('') }
  }
  const end = (cancel: boolean) => {
    const previous = before.current; before.current = null
    if (!previous || completed.current) return
    if (cancel) change(previous)
    else if (previous !== current.current) {
      history.remember(previous)
      if (isNurikabeSolved(board, current.current)) { completed.current = true; stop(); setSolved(true) }
    }
    save()
  }
  const cancel = () => { if (before.current) { change(before.current); before.current = null } }
  const undo = () => {
    if (completed.current) return
    cancel()
    const previous = history.undo(current.current)
    if (previous) { change(previous); setMessage('Undid the last move.'); save() }
  }
  const redo = () => {
    if (completed.current) return
    cancel()
    const next = history.redo(current.current)
    if (next) { change(next); setMessage('Redid the last move.'); save() }
  }
  const dirty = game.some((mark, cell) => board.clues[cell] === 0 && mark !== 0)
  const reset = () => {
    if (completed.current) return
    cancel()
    if (!current.current.some((mark, cell) => board.clues[cell] === 0 && mark !== 0)) return
    history.remember(current.current); change(createNurikabeGame(board))
    setMessage('Board cleared. Undo brings it back; the clock keeps running.'); save()
  }
  return <div className="nurikabe-game">
    <div className="nurikabe-workspace">
      <div className="nurikabe-controls">
        <div className="puzzle-tools">
          <span className="timer" role="timer" aria-label="Elapsed active time">{formatTime(elapsed)}</span>
          <button type="button" className="tool-button" disabled={solved || !history.canUndo} onClick={undo}>Undo</button>
          <button type="button" className="tool-button" disabled={solved || !history.canRedo} onClick={redo}>Redo</button>
          <ResetButton disabled={solved || !dirty} onReset={reset} />
        </div>
        <div className="nurikabe-picker" role="radiogroup" aria-label="Mark to place">
          {([1, 2, 0] satisfies NurikabeMark[]).map(value => <label className="nurikabe-pick" key={value}>
            <input className="sr-only" type="radio" name={pickerId} checked={brush === value} disabled={solved} onChange={() => setBrush(value)} aria-label={value === 1 ? 'Sea' : value === 2 ? 'Land' : 'Erase'} />
            <span className="nurikabe-pick-face"><span className="nurikabe-swatch" data-mark={value} aria-hidden="true">{value === 2 ? '•' : value === 0 ? '⌫' : ''}</span>{value === 1 ? 'Sea' : value === 2 ? 'Land' : 'Erase'}</span>
          </label>)}
        </div>
        <p className="nurikabe-mode">{solved ? 'Islands complete.' : brush === 1 ? 'Shade sea · tap again to clear' : brush === 2 ? 'Mark land · optional working dots' : 'Erase your marks'}</p>
      </div>
      <NurikabeBoard board={board} game={game} brush={brush} locked={solved} conflicts={conflicts} instructionsId={instructionsId}
        onBegin={begin} onApply={apply} onEnd={end} onUndo={undo} onRedo={redo} />
    </div>
    <p className={`nurikabe-feedback${conflicts.size ? ' error' : ''}`} role="status">{solved ? `Solved in ${formatTime(elapsed)}! Choose another board to keep playing.`
      : conflicts.size ? 'Check the highlighted cells. Islands cannot merge or exceed their number, and the sea cannot contain a 2×2 square.' : message || '\u00a0'}</p>
    {!saving && <p className="status error" role="status">Progress can&rsquo;t be saved. Keep this page open to retain your attempt.</p>}
    <p className="word-note" id={instructionsId}>Shade the connected sea. Unshaded cells form islands, each with one number matching its area. No 2×2 sea squares. Land dots are optional.</p>
    <p className="word-note">Pick a mark, then tap or drag. Arrows move; 1 or S shades sea; 2 or L marks land; Delete, Backspace or 0 erases. Enter or Space uses the picker. Ctrl/Cmd+Z undoes; Ctrl/Cmd+Shift+Z redoes. Hints are not available in this preview.</p>
  </div>
}
