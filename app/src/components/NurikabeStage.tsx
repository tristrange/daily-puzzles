import { PlayTimer } from './PlayTimer'
import type { Puzzle } from '../domain/puzzle'
import { puzzleOfToday } from '../domain/dates'
import { readStoredStats, storeSolve, summarise, type SolveRecord, type Stats } from '../lib/stats'
import { buildShareText, buildNurikabeSolutionShareText, copyText, puzzleShareLink } from '../lib/share'
import { SolvedPanel } from './SolvedPanel'
import { useLeaderboard } from '../lib/useLeaderboard'
import { useId, useRef, useState } from 'react'
import { createNurikabeGame, editNurikabeCell, isNurikabeSolved, nurikabeConflicts, type NurikabeBoard as Board, type NurikabeGame, type NurikabeMark } from '../domain/nurikabe'
import { formatTime } from '../domain/game'
import { readNurikabeProgress, storeNurikabeProgress } from '../lib/nurikabeProgress'
import { useMoveHistory } from '../lib/useMoveHistory'
import { usePlayClock } from '../lib/usePlayClock'
import { ResetButton } from './ResetButton'
import { NurikabeBoard } from './NurikabeBoard'
import './Nurikabe.css'

export function NurikabeStage({ board, puzzle }: { board: Board; puzzle?: Puzzle }) {
  const daily = puzzle !== undefined
  const [stats, setStats] = useState<Stats | null>(null)
  const [firstSolve, setFirstSolve] = useState<SolveRecord | null>(null)
  const [candidate, setCandidate] = useState<SolveRecord | null>(null)
  const { offerSolve } = useLeaderboard()
  const [copied, setCopied] = useState<'idle' | 'result' | 'solution' | 'failed'>('idle')
  const [shareText, setShareText] = useState<string | null>(null)
  const [initial] = useState(() => readNurikabeProgress(board, daily))
  const [game, setGame] = useState(() => initial?.game ?? createNurikabeGame(board))
  const current = useRef(game), before = useRef<NurikabeGame | null>(null), completed = useRef(false)
  const [solved, setSolved] = useState(false), [saving, setSaving] = useState(true), [message, setMessage] = useState('')
  const [brush, setBrush] = useState<NurikabeMark>(1)
  const history = useMoveHistory<NurikabeGame>(), instructionsId = useId(), pickerId = useId()
  const conflicts = nurikabeConflicts(board, game)
  const { time, settle, stop, restartAttempt } = usePlayClock(initial ?? { elapsedMs: 0 }, time => {
    setSaving(storeNurikabeProgress(board, before.current ?? current.current, time, daily))
  })
  const elapsed = time.elapsedMs
  const save = () => setSaving(storeNurikabeProgress(board, current.current, settle(), daily))
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
      if (isNurikabeSolved(board, current.current)) {
        const stoppedTime = stop()
        if (puzzle) {
          const when = Date.now()
          const earlier = readStoredStats().find(record => record.id === puzzle.id)
          setFirstSolve(earlier ?? null)
          const record: SolveRecord = { id: puzzle.id, puzzleType: 'nurikabe', size: board.size,
            ...stoppedTime, hints: 0, solvedAt: when }
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
  const share = async (variant: 'result' | 'solution') => {
    if (!puzzle) return
    const counted = firstSolve ?? { elapsedMs: elapsed, hints: 0 }
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
  return <div className="nurikabe-game">
    <div className="nurikabe-workspace">
      <div className="nurikabe-controls">
        <div className="puzzle-tools">
          <PlayTimer time={time} />
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
    <p className={`nurikabe-feedback${conflicts.size ? ' error' : ''}`} role="status">{solved ? message || `Solved in ${formatTime(elapsed)}!${daily ? '' : ' Choose another board to keep playing.'}`
      : conflicts.size ? 'Check the highlighted cells. Islands cannot merge or exceed their number, and the sea cannot contain a 2×2 square.' : message || '\u00a0'}</p>
    {daily && <SolvedPanel puzzleId={puzzle?.id} candidate={candidate} solved={solved} firstSolve={firstSolve} streak={stats?.currentStreak ?? 0} copied={copied} shareText={shareText} onShare={share} />}
    {!saving && <p className="status error" role="status">Progress can&rsquo;t be saved. Keep this page open to retain your attempt.</p>}
    <p className="word-note" id={instructionsId}>Shade the connected sea. Unshaded cells form islands, each with one number matching its area. No 2×2 sea squares. Land dots are optional.</p>
    <p className="word-note">Pick a mark, then tap or drag. Arrows move; 1 or S shades sea; 2 or L marks land; Delete, Backspace or 0 erases. Enter or Space uses the picker. Ctrl/Cmd+Z undoes; Ctrl/Cmd+Shift+Z redoes. Hints are not available for Nurikabe yet.</p>
  </div>
}
