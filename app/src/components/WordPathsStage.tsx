import { PlayTimer } from './PlayTimer'
import { useLeaderboard } from '../lib/useLeaderboard'
import { useId, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { Puzzle } from '../domain/puzzle'
import type { WordGrid } from '../domain/wordPaths'
import { createWordGame, clearTrace, traceCell, submitWord, undoWord, resetWordGame, isWordSolved, spellPath, type WordGame } from '../domain/wordGame'
import { usePlayClock } from '../lib/usePlayClock'
import { formatTime } from '../domain/game'
import { puzzleOfToday } from '../domain/dates'
import { clearWordProgress, readWordProgress, storeWordProgress } from '../lib/wordProgress'
import { readStoredStats, storeSolve, summarise, type SolveRecord, type Stats } from '../lib/stats'
import { buildShareText, buildWordSolutionShareText, copyText, puzzleShareLink, type ShareResult } from '../lib/share'
import { SolvedPanel } from './SolvedPanel'
import { WordPathsBoard } from './WordPathsBoard'
import { ResetButton } from './ResetButton'
import { useMoveHistory } from '../lib/useMoveHistory'
import { findWordHint } from '../domain/wordHints'
import { HintPanel } from './HintPanel'

export function WordPathsStage({ puzzle, grid, timeZone, previewBoard }: {
  puzzle: Puzzle; grid: WordGrid; timeZone: string; previewBoard?: number
}) {
  const preview = previewBoard !== undefined
  const [initial] = useState(() => readWordProgress(puzzle.id, grid, preview))
  const [game, setGame] = useState<WordGame>(() => initial?.game ?? createWordGame(grid))
  const current = useRef(game)
  const history = useMoveHistory<WordGame>()
  const [saving, setSaving] = useState(true)
  const [message, setMessage] = useState('')
  const stage = useRef<HTMLDivElement>(null)
  const hintButton = useRef<HTMLButtonElement>(null)
  const hintId = useId()
  const [hint, setHint] = useState<{ path: readonly number[]; revealed: number } | null>(null)
  const hintsUsed = useRef(initial?.hints ?? 0)
  const hintReasons = useMemo(() => hint ? [
    `This ${hint.path.length}-letter word leaves a way to finish using your accepted words.`,
    'Trace and submit it yourself. Your current selection stays unchanged.',
  ] : [], [hint])
  const completed = useRef(false)
  const [firstSolve, setFirstSolve] = useState<SolveRecord | null>(null)
  const [candidate, setCandidate] = useState<SolveRecord | null>(null)
  const { offerSolve } = useLeaderboard()
  const [stats, setStats] = useState<Stats | null>(null)
  const [copied, setCopied] = useState<'idle' | 'result' | 'solution' | 'failed'>('idle')
  const [shareText, setShareText] = useState<string | null>(null)
  const instructionsId = useId()
  const solved = isWordSolved(game)

  const { time, settle, stop, restartAttempt } = usePlayClock(initial ?? { elapsedMs: 0 }, time => {
    setSaving(storeWordProgress(puzzle.id, current.current, time, preview, hintsUsed.current))
  })
  const elapsed = time.elapsedMs
  const change = (next: WordGame) => {
    current.current = next
    setGame(next)
    setSaving(storeWordProgress(puzzle.id, next, settle(), preview, hintsUsed.current))
  }
  const select = (cell: number): readonly number[] => {
    if (completed.current) return current.current.trace
    const next = traceCell(current.current, cell)
    if (next !== current.current) { change(next); setMessage('') }
    return next.trace
  }
  const restoreTrace = (path: readonly number[]) => {
    if (!completed.current) change({ ...current.current, trace: [...path] })
  }
  const submit = () => {
    if (completed.current) return
    const before = current.current
    const result = submitWord(before)
    setMessage(result.message)
    if (!result.accepted) return
    setHint(null)
    history.remember(clearTrace(before))
    change(result.game)
    if (!isWordSolved(result.game)) return
    const stoppedTime = stop()
    completed.current = true
    clearWordProgress(puzzle.id, preview, grid.vocabularyVersion)
    if (!preview) {
      const when = Date.now()
      const earlier = readStoredStats().find((record) => record.id === puzzle.id)
      setFirstSolve(earlier ?? null)
      const record: SolveRecord = { id: puzzle.id, puzzleType: puzzle.puzzleType, size: grid.width,
        ...stoppedTime, hints: hintsUsed.current, solvedAt: when }
      setStats(summarise(storeSolve(record), puzzleOfToday(new Date(when), timeZone)))
      if (!earlier) { setCandidate(record); offerSolve(record) }
    }
    setMessage(`Solved in ${formatTime(stoppedTime.elapsedMs)}!`)
  }
  const undo = () => {
    if (completed.current) return
    const previous = history.undo(current.current, undoWord(current.current))
    if (!previous) return
    setHint(null)
    change(previous)
    setMessage('Undid the last move.')
  }
  const redo = () => {
    if (completed.current) return
    const next = history.redo(current.current)
    if (!next) return
    setHint(null)
    change(next)
    setMessage('Redid the last move.')
  }
  const reset = () => {
    if (completed.current) return
    setHint(null)
    history.remember(current.current)
    restartAttempt()
    change(resetWordGame(current.current))
    setMessage('Board cleared. Undo brings it back; total time and hints are kept.')
  }
  const countHint = () => {
    hintsUsed.current += 1
    setSaving(storeWordProgress(puzzle.id, current.current, settle(), preview, hintsUsed.current))
  }
  const requestHint = () => {
    if (completed.current) return
    if (hint) {
      const panel = stage.current?.querySelector<HTMLElement>('.hint-panel')
      panel?.focus({ preventScroll: true })
      panel?.scrollIntoView({ block: 'nearest' })
      return
    }
    const result = findWordHint(current.current)
    if (result.kind === 'hint') {
      setHint({ path: result.path, revealed: 1 })
      setMessage('Starting letter revealed. Ask for another letter only if you need it.')
      countHint()
    } else setMessage(result.kind === 'dead-end'
      ? (current.current.words.length > 0
        ? 'Your accepted words leave no way to finish. Use Undo to try a different word or path.'
        : 'No complete set of words was found in this board’s vocabulary.')
      : result.kind === 'limit' ? 'The hint search reached its limit. No dead end has been proved; keep exploring.' : '')
  }
  const revealLetter = () => {
    if (!hint || completed.current || hint.revealed >= hint.path.length) return
    setHint({ ...hint, revealed: hint.revealed + 1 })
    countHint()
  }
  const dismissHint = () => { setHint(null); hintButton.current?.focus({ preventScroll: true }) }
  const showHintCell = () => {
    const cell = stage.current?.querySelector<HTMLElement>('[data-hint="target"]')
    cell?.focus({ preventScroll: true })
    cell?.scrollIntoView({ block: 'center' })
  }
  const share = async (variant: 'result' | 'solution') => {
    const result: ShareResult = {
      puzzleId: puzzle.id, puzzleType: 'word-paths', width: grid.width, height: grid.height,
      elapsedMs: firstSolve?.elapsedMs ?? elapsed, hints: firstSolve?.hints ?? hintsUsed.current, streak: stats?.currentStreak ?? 0,
      link: puzzleShareLink(puzzle.id, previewBoard), ...(previewBoard === undefined ? {} : { previewBoard }),
    }
    const text = variant === 'result' ? buildShareText(result) : buildWordSolutionShareText(result, current.current)
    const ok = await copyText(text)
    setCopied(ok ? variant : 'failed')
    setShareText(ok ? null : text)
    setMessage(ok ? 'Share text copied.' : 'Could not reach the clipboard. Copy the text shown below.')
  }
  const traced = game.trace.map((cell) => grid.letters[cell]).join('')

  return (
    <div className="word-game" ref={stage}>
      <div className="puzzle-tools">
        <PlayTimer time={time} />
        <button className="tool-button" type="button" onClick={undo} disabled={solved || (!history.canUndo && game.words.length === 0)}>Undo</button>
        <button className="tool-button" type="button" onClick={redo} disabled={solved || !history.canRedo}>Redo</button>
        <ResetButton onReset={reset} disabled={solved || (game.words.length === 0 && game.trace.length === 0)} />
        <button ref={hintButton} type="button" className="tool-button" onClick={requestHint} disabled={solved}
          aria-label="Get a word hint" aria-expanded={hint !== null} aria-controls={hint ? hintId : undefined}>Hint</button>
      </div>
      {!saving && !solved && <p className="status error" role="status">Progress can&rsquo;t be saved in this browser. Keep this page open to retain it.</p>}
      <div className="word-workspace">
        <div className="word-play-area">
          <WordPathsBoard game={game} locked={solved} instructionsId={instructionsId} onSelect={select}
            onRestoreTrace={restoreTrace} onSubmit={submit} onUndo={undo} onRedo={redo} onRequestHint={requestHint}
            hintPath={hint ? hint.path.slice(0, hint.revealed) : []} hintId={hint ? hintId : undefined} />
          <div className="word-selection">
            <output aria-live="polite" aria-label="Selected word">{traced || (solved ? 'All letters used' : 'Select letters')}</output>
            <div className="word-actions">
              <button type="button" className="tool-button" disabled={solved || !game.trace.length} onClick={() => { change(clearTrace(current.current)); setMessage('Selection cleared.') }} aria-label="Clear selection">Clear</button>
              <button type="button" className="tool-button primary" disabled={solved || !game.trace.length} onClick={submit} aria-label="Submit word">Submit</button>
            </div>
          </div>
        </div>
        <ol className="word-slots" aria-label="Words to find" style={{ '--word-slot-columns': grid.wordLengths.length } as CSSProperties}>
          {[...grid.wordLengths].sort((a, b) => a - b).map((length) => {
            const path = game.words.find((word) => word.length === length)
            return <li key={length} data-length={path ? length : undefined} className={path ? 'filled' : ''}>
              <span>{length} letters</span><strong>{path ? spellPath(grid, path) : '·'.repeat(length)}</strong>
            </li>
          })}
        </ol>
      </div>
      <p className="word-feedback" role="status">{message || '\u00a0'}</p>
      {hint && <HintPanel id={hintId} variant="word"
        location={`Row ${Math.floor(hint.path[0]! / grid.width) + 1}, column ${hint.path[0]! % grid.width + 1}`}
        title={hint.path.map((cell, i) => i < hint.revealed ? grid.letters[cell] : '·').join(' ')}
        reasons={hintReasons} onApply={hint.revealed < hint.path.length ? revealLetter : undefined}
        onDismiss={dismissHint} onShowCell={showHintCell} />}
      <p className="word-instructions" id={instructionsId}>
        Drag adjoining letters and release to submit. Or tap letters, then Submit.
        With a keyboard: arrows move, Space selects, Enter submits; Backspace removes a letter and Escape clears selection. H asks for a hint.
      </p>
      <p className="word-note">Use every letter once. Accepted words can lead to a dead end; Undo lets you try another path. Only words in this game&rsquo;s English list are accepted.</p>
      <SolvedPanel puzzleId={preview ? undefined : puzzle.id} candidate={candidate} solved={solved} firstSolve={firstSolve} streak={stats?.currentStreak ?? 0} copied={copied} shareText={shareText} onShare={share} />
    </div>
  )
}
