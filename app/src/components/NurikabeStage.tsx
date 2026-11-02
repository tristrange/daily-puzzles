import { PlayTimer } from './PlayTimer'
import type { Puzzle } from '../domain/puzzle'
import { puzzleOfToday } from '../domain/dates'
import { readStoredStats, storeSolve, summarise, type SolveRecord, type Stats } from '../lib/stats'
import { buildShareText, buildNurikabeSolutionShareText, copyText, puzzleShareLink } from '../lib/share'
import { SolvedPanel } from './SolvedPanel'
import { useLeaderboard } from '../lib/useLeaderboard'
import { useId, useMemo, useRef, useState } from 'react'
import { createNurikabeGame, editNurikabeCell, isNurikabeSolved, nurikabeConflicts, type NurikabeBoard as Board, type NurikabeGame, type NurikabeMark } from '../domain/nurikabe'
import { formatTime } from '../domain/game'
import { readNurikabeProgress, storeNurikabeProgress } from '../lib/nurikabeProgress'
import { useMoveHistory } from '../lib/useMoveHistory'
import { usePlayClock } from '../lib/usePlayClock'
import { hintSignature, useReturnedHint } from '../lib/hintReturn'
import { ResetButton } from './ResetButton'
import { NurikabeBoard } from './NurikabeBoard'
import { applyNurikabeHint, findNurikabeHint, nurikabeCellName, revealNurikabeMistake, type NurikabeHint, type NurikabeMistake } from '../domain/nurikabeHints'
import { HintPanel, MistakeWarning } from './HintPanel'
import { nurikabeHintLesson } from '../domain/hintLessons'
import './Nurikabe.css'

type HintState = { kind: 'closed' } | { kind: 'warning'; mistake: NurikabeMistake } | { kind: 'explanation'; hint: NurikabeHint }

export function NurikabeStage({ board, puzzle }: { board: Board; puzzle?: Puzzle }) {
  const daily = puzzle !== undefined
  const [stats, setStats] = useState<Stats | null>(null)
  const [firstSolve, setFirstSolve] = useState<SolveRecord | null>(null)
  const [candidate, setCandidate] = useState<SolveRecord | null>(null)
  const { offerSolve } = useLeaderboard()
  const [copied, setCopied] = useState<'idle' | 'result' | 'solution' | 'failed'>('idle')
  const [shareText, setShareText] = useState<string | null>(null)
  const [initial] = useState(() => readNurikabeProgress(board, daily))
  const hints = useRef(initial?.hints ?? 0), [shownHints, setShownHints] = useState(initial?.hints ?? 0)
  const [game, setGame] = useState(() => initial?.game ?? createNurikabeGame(board))
  const hintState = JSON.stringify([board.size, board.clues, game])
  const returnedHint = useReturnedHint(board.id, hintState, () => {
    const result = findNurikabeHint(board, game)
    return result.kind === 'hint' ? result.hint : null
  })
  const [panel, setPanel] = useState<HintState>(returnedHint ? { kind: 'explanation', hint: returnedHint } : { kind: 'closed' })
  const hint = panel.kind === 'explanation' ? panel.hint : null
  const reasons = useMemo(() => hint ? [hint.reason] : [], [hint])
  const stage = useRef<HTMLDivElement>(null), hintButton = useRef<HTMLButtonElement>(null)
  const current = useRef(game), before = useRef<NurikabeGame | null>(null), completed = useRef(false)
  const [solved, setSolved] = useState(false), [saving, setSaving] = useState(true), [message, setMessage] = useState('')
  const [brush, setBrush] = useState<NurikabeMark>(1)
  const history = useMoveHistory<NurikabeGame>(), instructionsId = useId(), pickerId = useId(), hintId = useId()
  const conflicts = nurikabeConflicts(board, game)
  const { time, settle, stop, restartAttempt } = usePlayClock(initial ?? { elapsedMs: 0 }, time => {
    setSaving(storeNurikabeProgress(board, before.current ?? current.current, time, hints.current, daily))
  })
  const elapsed = time.elapsedMs
  const save = () => setSaving(storeNurikabeProgress(board, current.current, settle(), hints.current, daily))
  const change = (next: NurikabeGame) => { current.current = next; setGame(next); setPanel({ kind: 'closed' }) }
  const begin = () => { if (!completed.current) { before.current = current.current; setPanel({ kind: 'closed' }) } }
  const apply = (cell: number, value: NurikabeMark) => {
    if (!completed.current) { change(editNurikabeCell(board, current.current, cell, value)); setMessage('') }
  }
  const end = (cancel: boolean) => {
    const previous = before.current; before.current = null
    if (!previous || completed.current) return
    if (cancel) change(previous)
    else if (previous !== current.current) {
      history.remember(previous)
      if (isNurikabeSolved(board, current.current)) {
        const stoppedTime = stop()
        if (puzzle) {
          const when = Date.now()
          const earlier = readStoredStats().find(record => record.id === puzzle.id)
          setFirstSolve(earlier ?? null)
          const record: SolveRecord = { id: puzzle.id, puzzleType: 'nurikabe', size: board.size,
            ...stoppedTime, hints: hints.current, solvedAt: when }
          setStats(summarise(storeSolve(record), puzzleOfToday(new Date(when), Intl.DateTimeFormat().resolvedOptions().timeZone)))
          if (!earlier) { setCandidate(record); offerSolve(record) }
        }
        completed.current = true; setSolved(true)
      }
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
    restartAttempt()
    history.remember(current.current); change(createNurikabeGame(board))
    setMessage('Board cleared. Undo brings it back; total time and hints are kept.'); save()
  }
  const show = (next: NurikabeHint) => {
    setPanel({ kind: 'explanation', hint: next }); hints.current++; setShownHints(hints.current); setMessage(''); save()
  }
  const requestHint = () => {
    if (completed.current || before.current) return
    const result = findNurikabeHint(board, current.current)
    if (result.kind === 'hint') show(result.hint)
    else if (result.kind === 'mistake') { setPanel({ kind: 'warning', mistake: result }); setMessage('') }
    else {
      setPanel({ kind: 'closed' })
      setMessage(result.kind === 'unverified' ? 'The solution check could not verify this board. No mistake or hint has been revealed.'
        : 'These techniques found no further deduction. This does not prove that guessing is necessary.')
    }
  }
  const revealMistake = () => {
    if (completed.current || before.current || panel.kind !== 'warning') return
    const correction = revealNurikabeMistake(board, current.current, panel.mistake)
    if (correction) show(correction)
  }
  const dismissHint = () => { setPanel({ kind: 'closed' }); hintButton.current?.focus({ preventScroll: true }) }
  const showHintCell = () => {
    const target = stage.current?.querySelector<HTMLElement>('[data-hint="target"]')
    target?.focus({ preventScroll: true }); target?.scrollIntoView({ block: 'center' })
  }
  const acceptHint = () => {
    if (!hint || completed.current || before.current) return
    const next = applyNurikabeHint(board, current.current, hint)
    if (next === current.current) return
    begin(); change(next); end(false)
    if (!completed.current) setMessage('Hint applied. Undo restores your previous mark.')
    hintButton.current?.focus({ preventScroll: true })
  }
  const share = async (variant: 'result' | 'solution') => {
    if (!puzzle) return
    const counted = firstSolve ?? { elapsedMs: elapsed, hints: hints.current }
    const result = { puzzleId: puzzle.id, puzzleType: 'nurikabe' as const, width: board.size, height: board.size,
      elapsedMs: counted.elapsedMs, hints: counted.hints, streak: stats?.currentStreak ?? 0,
      link: puzzleShareLink(puzzle.id) }
    const text = variant === 'solution' ? buildNurikabeSolutionShareText(result, board, game) : buildShareText(result)
    const ok = await copyText(text)
    setCopied(ok ? variant : 'failed')
    setShareText(ok ? null : text)
    setMessage(ok ? (variant === 'solution' ? 'Solution share copied. It includes the finished board.' : 'Share text copied to the clipboard.')
      : 'Could not reach the clipboard. The share text is shown below, ready to copy.')
  }
  return <div className="nurikabe-game" ref={stage} onKeyDown={event => {
    if (event.key === 'Escape' && panel.kind !== 'closed') { event.preventDefault(); dismissHint() }
  }}>
    <div className="nurikabe-workspace">
      <div className="nurikabe-controls">
        <div className="puzzle-tools">
          <PlayTimer time={time} />
          <button type="button" className="tool-button" disabled={solved || !history.canUndo} onClick={undo}>Undo</button>
          <button type="button" className="tool-button" disabled={solved || !history.canRedo} onClick={redo}>Redo</button>
          <ResetButton disabled={solved || !dirty} onReset={reset} />
          <button type="button" className="tool-button" ref={hintButton} disabled={solved} onClick={requestHint}
            aria-label="Get an explained hint" aria-expanded={panel.kind !== 'closed'} aria-controls={panel.kind !== 'closed' ? hintId : undefined}>Hint</button>
        </div>
        <p className="nurikabe-mode">Hints used: {shownHints}</p>
        <div className="nurikabe-picker" role="radiogroup" aria-label="Mark to place">
          {([1, 2, 0] satisfies NurikabeMark[]).map(value => <label className="nurikabe-pick" key={value}>
            <input className="sr-only" type="radio" name={pickerId} checked={brush === value} disabled={solved} onChange={() => setBrush(value)} aria-label={value === 1 ? 'Sea' : value === 2 ? 'Land' : 'Erase'} />
            <span className="nurikabe-pick-face"><span className="nurikabe-swatch" data-mark={value} aria-hidden="true">{value === 2 ? '•' : value === 0 ? '⌫' : ''}</span>{value === 1 ? 'Sea' : value === 2 ? 'Land' : 'Erase'}</span>
          </label>)}
        </div>
        <p className="nurikabe-mode">{solved ? 'Islands complete.' : brush === 1 ? 'Shade sea · tap again to clear' : brush === 2 ? 'Mark land · optional working dots' : 'Erase your marks'}</p>
      </div>
      <NurikabeBoard board={board} game={game} brush={brush} locked={solved} conflicts={conflicts} hint={hint}
        instructionsId={panel.kind !== 'closed' ? `${instructionsId} ${hintId}` : instructionsId}
        onBegin={begin} onApply={apply} onEnd={end} onUndo={undo} onRedo={redo} onHint={requestHint} />
    </div>
    <p className={`nurikabe-feedback${conflicts.size ? ' error' : ''}`} role="status">{solved ? message || `Solved in ${formatTime(elapsed)} with ${shownHints} hint${shownHints === 1 ? '' : 's'}!${daily ? '' : ' Choose another board to keep playing.'}`
      : conflicts.size ? 'Check the highlighted cells. Islands cannot merge or exceed their number, and the sea cannot contain a 2×2 square.' : message || '\u00a0'}</p>
    {daily && <SolvedPanel puzzleId={puzzle?.id} candidate={candidate} solved={solved} firstSolve={firstSolve} streak={stats?.currentStreak ?? 0} copied={copied} shareText={shareText} onShare={share} />}
    {panel.kind === 'warning' && <MistakeWarning id={hintId} message="Your sea or land marks lead to a contradiction. Check your entries, or try Undo."
      onReveal={revealMistake} onDismiss={dismissHint} />}
    {hint && <HintPanel id={hintId} title={hint.kind === 'correction' ? 'Clear this mark' : hint.value === 1 ? 'Shade sea' : 'Mark land'}
      location={nurikabeCellName(board, hint.cell)} reasons={reasons} onApply={acceptHint} onDismiss={dismissHint} onShowCell={showHintCell}
      lesson={saving ? nurikabeHintLesson(hint) : undefined} puzzleId={puzzle?.id}
      resume={{ id: board.id, state: hintState, signature: hintSignature(hint) }}
      effect={hint.kind === 'correction' ? 'Apply clears only this mark. It leaves the cell undecided.' : hint.value === 2 ? 'Apply adds a land dot. Land dots are optional working marks.' : 'Apply shades this cell as sea.'} />}
    {!saving && <p className="status error" role="status">Progress can&rsquo;t be saved. Keep this page open to retain your attempt.</p>}
    <p className="word-note" id={instructionsId}>Shade the connected sea. Unshaded cells form islands, each with one number matching its area. No 2×2 sea squares. Land dots are optional.</p>
    <p className="word-note">Pick a mark, then tap or drag. Arrows move; 1 or S shades sea; 2 or L marks land; Delete, Backspace or 0 erases. Enter or Space uses the picker. H explains a hint. Ctrl/Cmd+Z undoes; Ctrl/Cmd+Shift+Z redoes.</p>
  </div>
}
