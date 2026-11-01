import { PlayTimer } from './PlayTimer'
import { useLeaderboard } from '../lib/useLeaderboard'
import { useEffect, useEffectEvent, useId, useRef, useState } from 'react'
import { createTrioGame, editTrio, isTrioSolved, TRIO_NAMES, trioConflicts, type TrioAction, type TrioBoard as Board, type TrioGame, type TrioValue } from '../domain/trio'
import { usePlayClock } from '../lib/usePlayClock'
import { hintSignature, useReturnedHint } from '../lib/hintReturn'
import { formatTime } from '../domain/game'
import { readTrioProgress, storeTrioProgress } from '../lib/trioProgress'
import { applyTrioHint, findTrioHint, type TrioHint } from '../domain/trioHints'
import { TRIO_NOTE_TAP_MS, TrioBoard, type TrioNoteGesture, type TrioNoteTap } from './TrioBoard'
import { TrioSymbol } from './TrioSymbol'
import { TrioHintPanel } from './TrioHintPanel'
import type { Puzzle } from '../domain/puzzle'
import { puzzleOfToday } from '../domain/dates'
import { readStoredStats, storeSolve, summarise, type SolveRecord, type Stats } from '../lib/stats'
import { buildShareText, buildTrioSolutionShareText, copyText, puzzleShareLink } from '../lib/share'
import { SolvedPanel } from './SolvedPanel'
import { ResetButton } from './ResetButton'
import { useMoveHistory } from '../lib/useMoveHistory'
import type { PlayTime } from '../lib/playTime'

type PendingWin = { before: TrioGame; winning: TrioGame; time: PlayTime; solvedAt: number; timer: ReturnType<typeof setTimeout> | null }

export function TrioStage({ board, puzzle }: { board: Board; puzzle?: Puzzle }) {
  const daily = puzzle !== undefined
  const [initial] = useState(() => readTrioProgress(board, daily))
  const hintsUsed = useRef(initial?.hints ?? 0)
  const [stats, setStats] = useState<Stats | null>(null)
  const [firstSolve, setFirstSolve] = useState<SolveRecord | null>(null)
  const [candidate, setCandidate] = useState<SolveRecord | null>(null)
  const { offerSolve } = useLeaderboard()
  const [copied, setCopied] = useState<'idle' | 'result' | 'solution' | 'failed'>('idle')
  const [shareText, setShareText] = useState<string | null>(null)
  const [game, setGame] = useState(() => initial?.game ?? createTrioGame(board))
  const current = useRef(game)
  const before = useRef<TrioGame | null>(null)
  const pendingWin = useRef<PendingWin | null>(null)
  const history = useMoveHistory<TrioGame>()
  const [brush, setBrush] = useState<TrioValue>(1)
  const [pencil, setPencil] = useState(false)
  const [solved, setSolved] = useState(false)
  const [solvedTime, setSolvedTime] = useState<PlayTime | null>(null)
  const completed = useRef(false)
  const [saving, setSaving] = useState(true)
  const [message, setMessage] = useState('')
  const hintState = JSON.stringify([board.givens, board.relations, game.cells, game.notes])
  const returnedHint = useReturnedHint(board.id, hintState, () => {
    const result = findTrioHint(board, game)
    return result.kind === 'hint' ? result.hint : null
  })
  const [hint, setHint] = useState<TrioHint | null>(returnedHint)
  const stage = useRef<HTMLDivElement>(null)
  const hintButton = useRef<HTMLButtonElement>(null)
  const instructionsId = useId(), pickerId = useId(), hintId = useId()
  const conflicts = trioConflicts(board, game.cells)

  // A held stroke can still be cancelled; a pending win may be replaced by a second tap.
  const { time, settle, stop, restartAttempt } = usePlayClock(initial ?? { elapsedMs: 0 }, time => {
    setSaving(storeTrioProgress(board, pendingWin.current?.before ?? before.current ?? current.current, time, daily, hintsUsed.current))
  })
  const elapsed = (solvedTime ?? time).elapsedMs
  const save = () => { setSaving(storeTrioProgress(board, pendingWin.current?.before ?? before.current ?? current.current, settle(), daily, hintsUsed.current)) }
  const change = (next: TrioGame) => { current.current = next; setGame(next) }
  const finishSolve = (timeAtMove?: PlayTime, solvedAt?: number) => {
    if (completed.current) return
    const stoppedTime = stop(), resultTime = timeAtMove ?? stoppedTime
    setSolvedTime(resultTime)
    if (puzzle) {
      // oxlint-disable-next-line react/purity -- Called by player events or the pending-tap timer.
      const when = solvedAt ?? Date.now(), earlier = readStoredStats().find(record => record.id === puzzle.id)
      setFirstSolve(earlier ?? null)
      const record: SolveRecord = { id: puzzle.id, puzzleType: 'trio', size: 9,
        ...resultTime, hints: hintsUsed.current, solvedAt: when }
      setStats(summarise(storeSolve(record), puzzleOfToday(new Date(when), Intl.DateTimeFormat().resolvedOptions().timeZone)))
      if (!earlier) { setCandidate(record); offerSolve(record) }
    }
    completed.current = true; setSolved(true)
  }
  const finishPending = () => {
    const pending = pendingWin.current
    if (!pending) return
    pendingWin.current = null
    if (pending.timer !== null) clearTimeout(pending.timer)
    change(pending.winning); finishSolve(pending.time, pending.solvedAt); save()
  }
  const finishOnExit = useEffectEvent(() => finishPending())
  useEffect(() => {
    const hidden = () => { if (document.hidden) finishOnExit() }
    document.addEventListener('visibilitychange', hidden)
    window.addEventListener('pagehide', finishOnExit); window.addEventListener('blur', finishOnExit)
    return () => {
      document.removeEventListener('visibilitychange', hidden)
      window.removeEventListener('pagehide', finishOnExit); window.removeEventListener('blur', finishOnExit)
      finishOnExit()
    }
  }, [])
  const begin = (repeat?: TrioNoteTap) => {
    const pending = pendingWin.current
    if (pending) {
      if (repeat && repeat.before === pending.before && repeat.after === pending.winning) {
        if (pending.timer !== null) clearTimeout(pending.timer)
        pending.timer = null
      } else finishPending()
    }
    if (completed.current) return false
    before.current = current.current; setHint(null)
    return true
  }
  const apply = (cell: number, action: TrioAction) => {
    if (!completed.current) { change(editTrio(board, current.current, cell, action)); setMessage('') }
  }
  const end = (cancel: boolean, gesture?: TrioNoteGesture): TrioGame => {
    const previous = before.current
    before.current = null
    if (!previous || completed.current) return current.current
    if (cancel) {
      change(previous)
      if (pendingWin.current) finishPending()
      else save()
      return current.current
    }
    if (gesture?.kind === 'double' && previous === gesture.first.after) {
      // The first tap already saved the original board in Undo history.
      const pending = pendingWin.current
      if (pending?.timer !== null && pending?.timer !== undefined) clearTimeout(pending.timer)
      pendingWin.current = null
      change(editTrio(board, gesture.first.before, gesture.first.cell, { value: gesture.first.symbol }))
      setMessage(`Placed ${TRIO_NAMES[gesture.first.symbol].toLowerCase()} from the note. Undo restores the note.`)
    } else if (pendingWin.current) {
      finishPending()
      return current.current
    } else if (previous !== current.current) history.remember(previous)
    if (isTrioSolved(board, current.current.cells)) {
      if (gesture?.kind === 'single' && current.current.cells[gesture.cell] !== gesture.symbol) {
        // A winning first tap can still be replaced by a different lone note on the second tap.
        // oxlint-disable-next-line react/purity -- This records the time of the player's finishing tap.
        const pending: PendingWin = { before: previous, winning: current.current, time: settle(), solvedAt: Date.now(), timer: null }
        pendingWin.current = pending
        pending.timer = setTimeout(finishPending, TRIO_NOTE_TAP_MS)
      } else { setMessage(''); finishSolve() }
    }
    save()
    return current.current
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
    restartAttempt()
    change(createTrioGame(board))
    setMessage('Board cleared. Undo brings it back; total time and hints are kept.')
    save()
  }
  const clearNotes = () => {
    if (completed.current || before.current || !current.current.notes.some(Boolean)) return
    setHint(null)
    history.remember(current.current)
    change({ ...current.current, notes: current.current.notes.map(() => 0) })
    setMessage('All notes cleared. Undo brings them back.')
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
          <PlayTimer time={solvedTime ?? time} />
          <button className="tool-button" type="button" onClick={undo} disabled={solved || !history.canUndo}>Undo</button>
          <button className="tool-button" type="button" onClick={redo} disabled={solved || !history.canRedo}>Redo</button>
          <ResetButton onReset={reset} disabled={solved || game.cells.every((v, i) => v === board.givens[i] && game.notes[i] === 0)} />
          <button className="tool-button notes-toggle" type="button" aria-pressed={pencil} disabled={solved} onClick={() => setPencil(!pencil)}>Notes</button>
          <button ref={hintButton} className="tool-button" type="button" aria-label="Get an explained hint" aria-expanded={hint !== null}
            aria-controls={hint ? hintId : undefined} disabled={solved} onClick={requestHint}>Hint</button>
        </div>
        <div className="trio-picker" role="radiogroup" aria-label="Symbol to place">
          {([1, 2, 3, 0] as const).map((value) => <label key={value} className="trio-pick">
            <input className="sr-only" type="radio" name={pickerId} checked={brush === value} disabled={solved} onChange={() => setBrush(value)} aria-label={value ? TRIO_NAMES[value] : 'Eraser'} />
            <span className="trio-pick-face">{value ? <TrioSymbol value={value} /> : <span aria-hidden="true">⌫</span>}<span>{value ? TRIO_NAMES[value] : 'Erase'}</span></span>
          </label>)}
        </div>
        <div className="trio-mode-actions">
          <p className="trio-mode">{solved ? `Solved in ${formatTime(elapsed)}!` : pencil && brush ? `Notes · tap to mark a possible ${TRIO_NAMES[brush].toLowerCase()}` : brush ? `Place ${TRIO_NAMES[brush].toLowerCase()} · tap again to clear` : 'Erase symbols and notes'}</p>
          <button className="tool-button" type="button" onClick={clearNotes} disabled={solved || !game.notes.some(Boolean)}>Clear notes</button>
        </div>
      </div>
      <TrioBoard board={board} game={game} brush={brush} pencil={pencil} locked={solved} conflicts={conflicts} instructionsId={hint ? `${instructionsId} ${hintId}` : instructionsId} hint={hint}
        noteShortcut onInterrupt={finishPending} onApply={apply} onBegin={begin} onEnd={end} onUndo={undo} onRedo={redo} onPencil={() => setPencil(!pencil)} />
    </div>
    <p className={`trio-feedback${conflicts.size ? ' error' : ''}`} role="status">
      {solved ? message || `Solved in ${formatTime(elapsed)}!${daily ? '' : ' Choose another board to keep playing.'}` : conflicts.size ? `${conflicts.size} cells conflict with the rules. You can keep editing or Undo.` : message || '\u00a0'}
    </p>
    {daily && <SolvedPanel puzzleId={puzzle?.id} candidate={candidate} solved={solved} firstSolve={firstSolve} streak={stats?.currentStreak ?? 0} copied={copied} shareText={shareText} onShare={share} />}
    {hint && <TrioHintPanel hint={hint} id={hintId} onApply={acceptHint} onDismiss={dismissHint} onShowCell={showHintCell} puzzleId={puzzle?.id} saving={saving}
      resume={{ id: board.id, state: hintState, signature: hintSignature(hint) }} />}
    {!saving && !solved && <p className="status error" role="status">Progress can&rsquo;t be saved. Keep this page open to retain your attempt.</p>}
    <p className="word-note" id={instructionsId}>Three of each symbol in every row and column. No three identical symbols consecutively.
      = means same; × means different. Cells with a corner dot are fixed.</p>
    <p className="word-note">Pick a symbol, then tap or drag. Notes marks possible symbols in empty cells. Double-tap or double-click a cell with one note to place it. Placing a symbol removes notes ruled out by counts, consecutive symbols and linked clues. Undo restores them. Clear notes removes all pencil marks.
      Arrows move; 1–3 place symbols; N toggles notes; Delete erases; Ctrl/Cmd+Z undoes; Ctrl/Cmd+Shift+Z redoes.</p>
  </div>
}
