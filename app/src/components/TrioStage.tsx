import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createTrioGame, editTrio, isTrioSolved, TRIO_NAMES, trioConflicts, type TrioAction, type TrioBoard as Board, type TrioGame, type TrioValue } from '../domain/trio'
import { advanceWordClock } from '../domain/wordClock'
import { formatTime } from '../domain/game'
import { readTrioProgress, storeTrioProgress } from '../lib/trioProgress'
import { applyTrioHint, findTrioHint, type TrioHint } from '../domain/trioHints'
import { TrioBoard } from './TrioBoard'
import { TrioSymbol } from './TrioSymbol'
import { TrioHintPanel } from './TrioHintPanel'
import type { Puzzle } from '../domain/puzzle'
import { puzzleOfToday } from '../domain/dates'
import { readStoredStats, storeSolve, summarise, type SolveRecord, type Stats } from '../lib/stats'
import { buildShareText, buildTrioSolutionShareText, copyText, puzzleShareLink } from '../lib/share'
import { SolvedPanel } from './SolvedPanel'
import { ResetButton } from './ResetButton'
import { useMoveHistory } from '../lib/useMoveHistory'

export function TrioStage({ board, puzzle }: { board: Board; puzzle?: Puzzle }) {
  const daily = puzzle !== undefined
  const [initial] = useState(() => readTrioProgress(board, daily))
  const hintsUsed = useRef(initial?.hints ?? 0)
  const [stats, setStats] = useState<Stats | null>(null)
  const [firstSolve, setFirstSolve] = useState<SolveRecord | null>(null)
  const [copied, setCopied] = useState<'idle' | 'result' | 'solution' | 'failed'>('idle')
  const [shareText, setShareText] = useState<string | null>(null)
  const [game, setGame] = useState(() => initial?.game ?? createTrioGame(board))
  const current = useRef(game)
  const before = useRef<TrioGame | null>(null)
  const history = useMoveHistory<TrioGame>()
  const [brush, setBrush] = useState<TrioValue>(1)
  const [pencil, setPencil] = useState(false)
  const [solved, setSolved] = useState(false)
  const completed = useRef(false)
  const [elapsed, setElapsed] = useState(initial?.elapsedMs ?? 0)
  const clock = useRef({ elapsedMs: initial?.elapsedMs ?? 0, lastAt: 0, visible: false })
  const [saving, setSaving] = useState(true)
  const [message, setMessage] = useState('')
  const [hint, setHint] = useState<TrioHint | null>(null)
  const stage = useRef<HTMLDivElement>(null)
  const hintButton = useRef<HTMLButtonElement>(null)
  const instructionsId = useId(), pickerId = useId(), hintId = useId()
  const conflicts = trioConflicts(board, game.cells)

  const settle = useCallback(() => {
    clock.current = advanceWordClock(clock.current, performance.now(), !document.hidden && !completed.current)
    return Math.floor(clock.current.elapsedMs)
  }, [])
  const save = useCallback(() => {
    const time = settle()
    setElapsed(time)
    setSaving(storeTrioProgress(board, current.current, time, daily, hintsUsed.current))
  }, [board, daily, settle])
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
      if (!completed.current) storeTrioProgress(board, current.current, settle(), daily, hintsUsed.current)
    }
  }, [board, daily, save, settle, solved])

  const change = (next: TrioGame) => { current.current = next; setGame(next) }
  const begin = () => { before.current = current.current; setHint(null) }
  const apply = (cell: number, action: TrioAction) => {
    if (!completed.current) { change(editTrio(board, current.current, cell, action)); setMessage('') }
  }
  const end = (cancel: boolean) => {
    const previous = before.current
    before.current = null
    if (!previous || completed.current) return
    if (cancel) change(previous)
    else if (previous !== current.current) {
      history.remember(previous)
      if (isTrioSolved(board, current.current.cells)) {
        const elapsedMs = settle()
        setElapsed(elapsedMs)
        if (puzzle) {
          const when = Date.now()
          setFirstSolve(readStoredStats().find((record) => record.id === puzzle.id) ?? null)
          setStats(summarise(storeSolve({ id: puzzle.id, puzzleType: 'trio', size: 9,
            elapsedMs, hints: hintsUsed.current, solvedAt: when }),
            puzzleOfToday(new Date(when), Intl.DateTimeFormat().resolvedOptions().timeZone)))
        }
        completed.current = true
        clock.current.visible = false
        setSolved(true)
      }
    }
    save()
  }
  const undo = () => {
    if (completed.current || before.current) return
    const previous = history.undo(current.current)
    if (!previous) return
    setHint(null)
    change(previous)
    setMessage('Undid the last move.')
    save()
  }
  const redo = () => {
    if (completed.current || before.current) return
    const next = history.redo(current.current)
    if (!next) return
    setHint(null)
    change(next)
    setMessage('Redid the last move.')
    save()
  }
  const reset = () => {
    if (completed.current || before.current) return
    setHint(null)
    history.remember(current.current)
    change(createTrioGame(board))
    setMessage('Board cleared. Undo brings it back; the clock keeps running.')
    save()
  }
  const requestHint = () => {
    if (completed.current || before.current) return
    const result = findTrioHint(board, current.current)
    setHint(result.kind === 'hint' ? result.hint : null)
    if (result.kind === 'hint') { hintsUsed.current += 1; save() }
    setMessage(result.kind === 'contradiction' ? 'Your placed symbols lead to a contradiction. Check your entries or Undo before asking for a hint.'
      : result.kind === 'none' ? 'These rules found no further deduction. This does not prove that guessing is necessary.' : '')
  }
  const dismissHint = () => { setHint(null); hintButton.current?.focus({ preventScroll: true }) }
  const showHintCell = () => {
    const cell = stage.current?.querySelector<HTMLButtonElement>('[data-hint="target"]')
    cell?.focus({ preventScroll: true })
    cell?.scrollIntoView({ block: 'center' })
  }
  const acceptHint = () => {
    if (!hint || completed.current || before.current) return
    const next = applyTrioHint(board, current.current, hint)
    if (next === current.current) { dismissHint(); return }
    begin()
    change(next)
    end(false)
    setMessage(completed.current ? '' : 'Hint applied. Undo brings back your previous symbols and notes.')
    hintButton.current?.focus({ preventScroll: true })
  }

  const share = async (variant: 'result' | 'solution') => {
    if (!puzzle) return
    const counted = firstSolve ?? { elapsedMs: elapsed, hints: hintsUsed.current }
    const result = { puzzleId: puzzle.id, puzzleType: 'trio' as const, width: 9, height: 9,
      elapsedMs: counted.elapsedMs, hints: counted.hints, streak: stats?.currentStreak ?? 0,
      link: puzzleShareLink(puzzle.id) }
    const text = variant === 'solution' ? buildTrioSolutionShareText(result, game.cells) : buildShareText(result)
    const ok = await copyText(text)
    setCopied(ok ? variant : 'failed')
    setShareText(ok ? null : text)
    setMessage(ok ? (variant === 'solution' ? 'Share text with the solution copied — that one gives the puzzle away.' : 'Share text copied to the clipboard.')
      : 'Could not reach the clipboard — the share text is shown below, ready to copy.')
  }

  return <div className="trio-game" ref={stage}>
    <div className="trio-workspace">
      <div className="trio-controls">
        <div className="puzzle-tools">
          <span className="timer" role="timer" aria-label="Elapsed active time">{formatTime(elapsed)}</span>
          <button className="tool-button" type="button" onClick={undo} disabled={solved || !history.canUndo}>Undo</button>
          <button className="tool-button" type="button" onClick={redo} disabled={solved || !history.canRedo}>Redo</button>
          <ResetButton onReset={reset} disabled={solved || game.cells.every((v, i) => v === board.givens[i] && game.notes[i] === 0)} />
          <button className="tool-button" type="button" aria-pressed={pencil} disabled={solved} onClick={() => setPencil(!pencil)}>Notes</button>
          <button ref={hintButton} className="tool-button" type="button" aria-label="Get an explained hint" aria-expanded={hint !== null}
            aria-controls={hint ? hintId : undefined} disabled={solved} onClick={requestHint}>Hint</button>
        </div>
        <div className="trio-picker" role="radiogroup" aria-label="Symbol to place">
          {([1, 2, 3, 0] as const).map((value) => <label key={value} className="trio-pick">
            <input className="sr-only" type="radio" name={pickerId} checked={brush === value} disabled={solved} onChange={() => setBrush(value)} aria-label={value ? TRIO_NAMES[value] : 'Eraser'} />
            <span className="trio-pick-face">{value ? <TrioSymbol value={value} /> : <span aria-hidden="true">⌫</span>}<span>{value ? TRIO_NAMES[value] : 'Erase'}</span></span>
          </label>)}
        </div>
        <p className="trio-mode">{solved ? `Solved in ${formatTime(elapsed)}!` : pencil && brush ? `Notes · tap to mark a possible ${TRIO_NAMES[brush].toLowerCase()}` : brush ? `Place ${TRIO_NAMES[brush].toLowerCase()} · tap again to clear` : 'Erase symbols and notes'}</p>
      </div>
      <TrioBoard board={board} game={game} brush={brush} pencil={pencil} locked={solved} conflicts={conflicts} instructionsId={hint ? `${instructionsId} ${hintId}` : instructionsId} hint={hint}
        onApply={apply} onBegin={begin} onEnd={end} onUndo={undo} onRedo={redo} onPencil={() => setPencil(!pencil)} />
    </div>
    <p className={`trio-feedback${conflicts.size ? ' error' : ''}`} role="status">
      {solved ? message || `Solved in ${formatTime(elapsed)}!${daily ? '' : ' Choose another board to keep playing.'}` : conflicts.size ? `${conflicts.size} cells conflict with the rules. You can keep editing or Undo.` : message || '\u00a0'}
    </p>
    {daily && <SolvedPanel solved={solved} firstSolve={firstSolve} streak={stats?.currentStreak ?? 0} copied={copied} shareText={shareText} onShare={share} />}
    {hint && <TrioHintPanel hint={hint} id={hintId} onApply={acceptHint} onDismiss={dismissHint} onShowCell={showHintCell} />}
    {!saving && !solved && <p className="status error" role="status">Progress can&rsquo;t be saved. Keep this page open to retain your attempt.</p>}
    <p className="word-note" id={instructionsId}>Three of each symbol in every row and column. No three identical symbols consecutively.
      = means same; × means different. Cells with a corner dot are fixed.</p>
    <p className="word-note">Pick a symbol, then tap or drag. Notes marks possible symbols in empty cells.
      Arrows move; 1–3 place symbols; N toggles notes; Delete erases; Ctrl/Cmd+Z undoes; Ctrl/Cmd+Shift+Z redoes.</p>
  </div>
}
