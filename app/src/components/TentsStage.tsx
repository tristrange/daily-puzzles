import { PlayTimer } from './PlayTimer'
import { useLeaderboard } from '../lib/useLeaderboard'
import type { Puzzle } from '../domain/puzzle'
import { puzzleOfToday } from '../domain/dates'
import { readStoredStats, storeSolve, summarise, type SolveRecord, type Stats } from '../lib/stats'
import { buildShareText, buildTentsSolutionShareText, copyText, puzzleShareLink } from '../lib/share'
import { SolvedPanel } from './SolvedPanel'
import { useId, useMemo, useRef, useState } from 'react'
import { createTentsGame, editTent, isTentsSolved, tentsConflicts, type TentsBoard as Board, type TentsGame, type TentsMark } from '../domain/tents'
import { findTentsHint, tentsCellName, type TentsHint } from '../domain/tentsHints'
import { usePlayClock } from '../lib/usePlayClock'
import { formatTime } from '../domain/game'
import { readTentsProgress, storeTentsProgress } from '../lib/tentsProgress'
import { useMoveHistory } from '../lib/useMoveHistory'
import { HintPanel } from './HintPanel'
import { ResetButton } from './ResetButton'
import { TentsBoard } from './TentsBoard'
import { TentsSymbol } from './TentsSymbol'

export function TentsStage({ board, puzzle }: { board: Board; puzzle?: Puzzle }) {
  const daily = puzzle !== undefined
  const [stats, setStats] = useState<Stats | null>(null)
  const [firstSolve, setFirstSolve] = useState<SolveRecord | null>(null)
  const [candidate, setCandidate] = useState<SolveRecord | null>(null)
  const { offerSolve } = useLeaderboard()
  const [copied, setCopied] = useState<'idle' | 'result' | 'solution' | 'failed'>('idle')
  const [shareText, setShareText] = useState<string | null>(null)
  const [initial] = useState(() => readTentsProgress(board, daily))
  const [game, setGame] = useState(() => initial?.game ?? createTentsGame(board))
  const current = useRef(game), before = useRef<TentsGame | null>(null)
  const history = useMoveHistory<TentsGame>()
  const [brush, setBrush] = useState<TentsMark>(1)
  const [result, setResult] = useState<{ hints: number } | null>(null), completed = useRef(false)
  const solved = result !== null
  const hintsUsed = useRef(initial?.hints ?? 0)
  const [saving, setSaving] = useState(true), [message, setMessage] = useState('')
  const [hint, setHint] = useState<TentsHint | null>(null)
  const stage = useRef<HTMLDivElement>(null), hintButton = useRef<HTMLButtonElement>(null)
  const instructionsId = useId(), pickerId = useId(), hintId = useId()
  const conflicts = tentsConflicts(board, game)
  const reasons = useMemo(() => hint ? hint.reason.split('\n') : [], [hint])

  const { time, settle, stop, restartAttempt } = usePlayClock(initial ?? { elapsedMs: 0 }, time => {
    setSaving(storeTentsProgress(board, current.current, time, hintsUsed.current, daily))
  })
  const elapsed = time.elapsedMs
  const save = () => { setSaving(storeTentsProgress(board, current.current, settle(), hintsUsed.current, daily)) }
  const change = (next: TentsGame) => { current.current = next; setGame(next) }
  const begin = () => { if (!completed.current) { before.current = current.current; setHint(null) } }
  const apply = (cell: number, value: TentsMark) => {
    if (!completed.current) { change(editTent(board, current.current, cell, value)); setMessage('') }
  }
  const end = (cancel: boolean) => {
    const previous = before.current; before.current = null
    if (!previous || completed.current) return
    if (cancel) change(previous)
    else if (previous !== current.current) {
      history.remember(previous)
      if (isTentsSolved(board, current.current)) {
        const stoppedTime = stop()
        if (puzzle) {
          const when = Date.now()
          const earlier = readStoredStats().find(record => record.id === puzzle.id)
          setFirstSolve(earlier ?? null)
          const record: SolveRecord = { id: puzzle.id, puzzleType: 'tents', size: board.size,
            ...stoppedTime, hints: hintsUsed.current, solvedAt: when }
          setStats(summarise(storeSolve(record), puzzleOfToday(new Date(when), Intl.DateTimeFormat().resolvedOptions().timeZone)))
          if (!earlier) { setCandidate(record); offerSolve(record) }
        }
        completed.current = true; setResult({ hints: hintsUsed.current })
      }
    }
    save()
  }
  const undo = () => {
    if (completed.current || before.current) return
    const previous = history.undo(current.current)
    if (!previous) return
    setHint(null); change(previous); setMessage('Undid the last move.'); save()
  }
  const redo = () => {
    if (completed.current || before.current) return
    const next = history.redo(current.current)
    if (!next) return
    setHint(null); change(next); setMessage('Redid the last move.'); save()
  }
  const reset = () => {
    if (completed.current || before.current || !current.current.some(Boolean)) return
    restartAttempt()
    setHint(null); history.remember(current.current); change(createTentsGame(board))
    setMessage('Board cleared. Undo brings it back; total time and hints are kept.'); save()
  }
  const requestHint = () => {
    if (completed.current || before.current) return
    const result = findTentsHint(board, current.current)
    setHint(result.kind === 'hint' ? result.hint : null)
    if (result.kind === 'hint') { hintsUsed.current += 1; save() }
    setMessage(result.kind === 'contradiction' ? 'Your tents or grass lead to a contradiction. Check your entries or Undo.'
      : result.kind === 'none' ? 'These rules found no further deduction. This does not prove guessing is necessary.' : '')
  }
  const dismissHint = () => { setHint(null); hintButton.current?.focus({ preventScroll: true }) }
  const showHintCell = () => {
    const cell = stage.current?.querySelector<HTMLButtonElement>('[data-hint="target"]')
    cell?.focus({ preventScroll: true }); cell?.scrollIntoView({ block: 'center' })
  }
  const acceptHint = () => {
    if (!hint || completed.current || before.current) return
    begin(); apply(hint.cell, hint.value); end(false)
    if (!completed.current) setMessage('Hint applied. Undo restores the previous board.')
    hintButton.current?.focus({ preventScroll: true })
  }

  const share = async (variant: 'result' | 'solution') => {
    if (!puzzle) return
    const counted = firstSolve ?? { elapsedMs: elapsed, hints: hintsUsed.current }
    const result = { puzzleId: puzzle.id, puzzleType: 'tents' as const, width: board.size, height: board.size,
      elapsedMs: counted.elapsedMs, hints: counted.hints, streak: stats?.currentStreak ?? 0,
      link: puzzleShareLink(puzzle.id) }
    const text = variant === 'solution' ? buildTentsSolutionShareText(result, board, game) : buildShareText(result)
    const ok = await copyText(text)
    setCopied(ok ? variant : 'failed')
    setShareText(ok ? null : text)
    setMessage(ok ? (variant === 'solution' ? 'Share text with the solution copied — that one gives the puzzle away.' : 'Share text copied to the clipboard.')
      : 'Could not reach the clipboard — the share text is shown below, ready to copy.')
  }

  return <div className="tents-game" ref={stage}>
    <div className="tents-workspace">
      <div className="tents-controls">
        <div className="puzzle-tools">
          <PlayTimer time={time} />
          <button className="tool-button" type="button" onClick={undo} disabled={solved || !history.canUndo}>Undo</button>
          <button className="tool-button" type="button" onClick={redo} disabled={solved || !history.canRedo}>Redo</button>
          <ResetButton onReset={reset} disabled={solved || !game.some(Boolean)} />
          <button ref={hintButton} className="tool-button" type="button" onClick={requestHint} disabled={solved}
            aria-label="Get an explained hint" aria-expanded={hint !== null} aria-controls={hint ? hintId : undefined}>Hint</button>
        </div>
        <div className="tents-picker" role="radiogroup" aria-label="Mark to place">
          {([1, 2, 0] as const).map(value => <label key={value} className="trio-pick">
            <input className="sr-only" type="radio" name={pickerId} checked={brush === value} disabled={solved} onChange={() => setBrush(value)} aria-label={value === 1 ? 'Tent' : value === 2 ? 'Grass' : 'Eraser'} />
            <span className="trio-pick-face"><TentsSymbol kind={value === 1 ? 'tent' : value === 2 ? 'grass' : 'erase'} /><span>{value === 1 ? 'Tent' : value === 2 ? 'Grass' : 'Erase'}</span></span>
          </label>)}
        </div>
        <p className="trio-mode">{solved ? 'All trees have a tent.' : brush === 1 ? 'Place a tent · tap again to clear' : brush === 2 ? 'Mark grass · no tent here' : 'Erase your marks'}</p>
      </div>
      <TentsBoard board={board} game={game} brush={brush} locked={solved} conflicts={conflicts} hint={hint}
        instructionsId={hint ? `${instructionsId} ${hintId}` : instructionsId} onBegin={begin} onApply={apply} onEnd={end} onUndo={undo} onRedo={redo} onHint={requestHint} />
    </div>
    <p className={`trio-feedback${conflicts.size ? ' error' : ''}`} role="status">{solved
      ? message || `Solved in ${formatTime(elapsed)} with ${result.hints} hint${result.hints === 1 ? '' : 's'}!${daily ? '' : ' Choose another board to keep playing.'}`
      : conflicts.size ? 'Check the highlighted tents: some touch, exceed a line count or cannot each be paired with a different tree.' : message || '\u00a0'}</p>
    {daily && <SolvedPanel puzzleId={puzzle?.id} candidate={candidate} solved={solved} firstSolve={firstSolve} streak={stats?.currentStreak ?? 0} copied={copied} shareText={shareText} onShare={share} />}
    {hint && <HintPanel id={hintId} title={hint.value === 1 ? 'Place a tent' : 'Mark grass'} location={tentsCellName(board, hint.cell)}
      reasons={reasons} effect="Uses your tents and grass as assumptions. A mistaken grass mark can mislead hints."
      onApply={acceptHint} onDismiss={dismissHint} onShowCell={showHintCell} />}
    {!saving && !solved && <p className="status error" role="status">Progress can&rsquo;t be saved. Keep this page open to retain your attempt.</p>}
    <p className="word-note" id={instructionsId}>Pair every tree with one tent directly above, below, left or right. Match the line counts. Tents cannot touch, even diagonally. Grass marks are optional.</p>
    <p className="word-note">Pick a mark, then tap or drag. Arrows move; 1 or T places a tent; 2 or G marks grass; Delete erases; H explains a hint. Ctrl/Cmd+Z undoes; Ctrl/Cmd+Shift+Z redoes.</p>
  </div>
}
