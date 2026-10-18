import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createTrioGame, editTrio, isTrioSolved, TRIO_NAMES, trioConflicts, type TrioAction, type TrioBoard as Board, type TrioGame, type TrioValue } from '../domain/trio'
import { advanceWordClock } from '../domain/wordClock'
import { formatTime } from '../domain/game'
import { readTrioProgress, storeTrioProgress } from '../lib/trioProgress'
import { TrioBoard } from './TrioBoard'
import { TrioSymbol } from './TrioSymbol'

export function TrioStage({ board }: { board: Board }) {
  const [initial] = useState(() => readTrioProgress(board))
  const [game, setGame] = useState(() => initial?.game ?? createTrioGame(board))
  const current = useRef(game)
  const before = useRef<TrioGame | null>(null)
  const [history, setHistory] = useState<TrioGame[]>([])
  const [brush, setBrush] = useState<TrioValue>(1)
  const [pencil, setPencil] = useState(false)
  const [solved, setSolved] = useState(false)
  const completed = useRef(false)
  const [elapsed, setElapsed] = useState(initial?.elapsedMs ?? 0)
  const clock = useRef({ elapsedMs: initial?.elapsedMs ?? 0, lastAt: 0, visible: false })
  const [saving, setSaving] = useState(true)
  const [message, setMessage] = useState('')
  const instructionsId = useId(), pickerId = useId()
  const conflicts = trioConflicts(board, game.cells)

  const settle = useCallback(() => {
    clock.current = advanceWordClock(clock.current, performance.now(), !document.hidden && !completed.current)
    return Math.floor(clock.current.elapsedMs)
  }, [])
  const save = useCallback(() => {
    const time = settle()
    setElapsed(time)
    setSaving(storeTrioProgress(board, current.current, time))
  }, [board, settle])
  useEffect(() => {
    if (solved) return
    clock.current = { ...clock.current, lastAt: performance.now(), visible: !document.hidden }
    const flush = () => { if (!completed.current) save() }
    const timer = setInterval(flush, 500)
    document.addEventListener('visibilitychange', flush)
    window.addEventListener('pagehide', flush)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', flush)
      window.removeEventListener('pagehide', flush)
      if (!completed.current) storeTrioProgress(board, current.current, settle())
    }
  }, [board, save, settle, solved])

  const change = (next: TrioGame) => { current.current = next; setGame(next) }
  const remember = (previous: TrioGame) => setHistory((past) => [...past.slice(-99), previous])
  const begin = () => { before.current = current.current }
  const apply = (cell: number, action: TrioAction) => {
    if (!completed.current) { change(editTrio(board, current.current, cell, action)); setMessage('') }
  }
  const end = (cancel: boolean) => {
    const previous = before.current
    before.current = null
    if (!previous || completed.current) return
    if (cancel) change(previous)
    else if (previous !== current.current) {
      remember(previous)
      if (isTrioSolved(board, current.current.cells)) {
        setElapsed(settle())
        completed.current = true
        clock.current.visible = false
        setSolved(true)
      }
    }
    save()
  }
  const undo = () => {
    const previous = history.at(-1)
    if (completed.current || before.current || !previous) return
    change(previous)
    setHistory(history.slice(0, -1))
    setMessage('Undid the last move.')
    save()
  }
  const reset = () => {
    if (completed.current || before.current) return
    remember(current.current)
    change(createTrioGame(board))
    setMessage('Board cleared. Undo brings it back; the clock keeps running.')
    save()
  }

  return <div className="trio-game">
    <div className="puzzle-tools">
      <span className="timer" role="timer" aria-label="Elapsed active time">{formatTime(elapsed)}</span>
      <button className="tool-button" type="button" onClick={undo} disabled={solved || history.length === 0}>Undo</button>
      <button className="tool-button" type="button" onClick={reset} disabled={solved || game.cells.every((v, i) => v === board.givens[i] && game.notes[i] === 0)}>Reset</button>
      <button className="tool-button" type="button" aria-pressed={pencil} disabled={solved} onClick={() => setPencil(!pencil)}>Notes</button>
    </div>
    <div className="trio-picker" role="radiogroup" aria-label="Symbol to place">
      {([1, 2, 3, 0] as const).map((value) => <label key={value} className="trio-pick">
        <input className="sr-only" type="radio" name={pickerId} checked={brush === value} disabled={solved} onChange={() => setBrush(value)} aria-label={value ? TRIO_NAMES[value] : 'Eraser'} />
        <span className="trio-pick-face">{value ? <TrioSymbol value={value} /> : <span aria-hidden="true">⌫</span>}<span>{value ? TRIO_NAMES[value] : 'Erase'}</span></span>
      </label>)}
    </div>
    <p className="trio-mode">{solved ? `Solved in ${formatTime(elapsed)}!` : pencil && brush ? `Notes · tap to mark a possible ${TRIO_NAMES[brush].toLowerCase()}` : brush ? `Place ${TRIO_NAMES[brush].toLowerCase()} · tap again to clear` : 'Erase symbols and notes'}</p>
    <TrioBoard board={board} game={game} brush={brush} pencil={pencil} locked={solved} conflicts={conflicts} instructionsId={instructionsId}
      onApply={apply} onBegin={begin} onEnd={end} onUndo={undo} onPencil={() => setPencil(!pencil)} />
    <p className={`trio-feedback${conflicts.size ? ' error' : ''}`} role="status">
      {solved ? `Solved in ${formatTime(elapsed)}! Choose another board to keep playing.` : conflicts.size ? `${conflicts.size} cells conflict with the rules. You can keep editing or Undo.` : message || '\u00a0'}
    </p>
    {!saving && !solved && <p className="status error" role="status">Progress can&rsquo;t be saved. Keep this page open to retain your attempt.</p>}
    <p className="word-note" id={instructionsId}>Three of each symbol in every row and column. No three identical symbols consecutively.
      = means same; × means different. Cells with a corner dot are fixed.</p>
    <p className="word-note">Pick a symbol, then tap or drag. Notes marks possible symbols in empty cells.
      Arrows move; 1–3 place symbols; N toggles notes; Delete erases; Ctrl/Cmd+Z undoes.</p>
  </div>
}
