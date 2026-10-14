import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { Puzzle } from '../domain/puzzle'
import type { WordGrid } from '../domain/wordPaths'
import { createWordGame, clearTrace, traceCell, submitWord, undoWord, resetWordGame, isWordSolved, spellPath, type WordGame } from '../domain/wordGame'
import { advanceWordClock } from '../domain/wordClock'
import { formatTime } from '../domain/game'
import { puzzleOfToday } from '../domain/dates'
import { clearWordProgress, readWordProgress, storeWordProgress } from '../lib/wordProgress'
import { readStoredStats, storeSolve, summarise, type SolveRecord, type Stats } from '../lib/stats'
import { buildShareText, buildWordSolutionShareText, copyText, puzzleShareLink, type ShareResult } from '../lib/share'
import { SolvedPanel } from './SolvedPanel'
import { WordPathsBoard } from './WordPathsBoard'

export function WordPathsStage({ puzzle, grid, timeZone, previewBoard }: {
  puzzle: Puzzle; grid: WordGrid; timeZone: string; previewBoard?: number
}) {
  const preview = previewBoard !== undefined
  const [initial] = useState(() => readWordProgress(puzzle.id, grid, preview))
  const [game, setGame] = useState<WordGame>(() => initial?.game ?? createWordGame(grid))
  const current = useRef(game)
  const [history, setHistory] = useState<WordGame[]>([])
  const clock = useRef({ elapsedMs: initial?.elapsedMs ?? 0, lastAt: 0, visible: false })
  const [elapsed, setElapsed] = useState(initial?.elapsedMs ?? 0)
  const [saving, setSaving] = useState(true)
  const [message, setMessage] = useState('')
  const completed = useRef(false)
  const [firstSolve, setFirstSolve] = useState<SolveRecord | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [copied, setCopied] = useState<'idle' | 'result' | 'solution' | 'failed'>('idle')
  const [shareText, setShareText] = useState<string | null>(null)
  const instructionsId = useId()
  const solved = isWordSolved(game)

  const settle = useCallback(() => {
    clock.current = advanceWordClock(clock.current, performance.now(), !document.hidden)
    return Math.floor(clock.current.elapsedMs)
  }, [])
  useEffect(() => {
    if (solved) return
    clock.current = { ...clock.current, lastAt: performance.now(), visible: !document.hidden }
    const save = () => {
      if (completed.current) return
      const time = settle()
      setElapsed(time)
      setSaving(storeWordProgress(puzzle.id, current.current, time, preview))
    }
    const timer = setInterval(save, 500)
    document.addEventListener('visibilitychange', save)
    window.addEventListener('pagehide', save)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', save)
      window.removeEventListener('pagehide', save)
      if (!completed.current) storeWordProgress(puzzle.id, current.current, settle(), preview)
    }
  }, [preview, puzzle.id, settle, solved])

  const change = (next: WordGame) => {
    current.current = next
    setGame(next)
    setSaving(storeWordProgress(puzzle.id, next, Math.floor(clock.current.elapsedMs), preview))
  }
  const remember = (before: WordGame) => setHistory((past) => [...past.slice(-99), before])
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
    remember(clearTrace(before))
    change(result.game)
    if (!isWordSolved(result.game)) return
    const time = settle()
    completed.current = true
    clearWordProgress(puzzle.id, preview, grid.vocabularyVersion)
    setElapsed(time)
    if (!preview) {
      const when = Date.now()
      const earlier = readStoredStats().find((record) => record.id === puzzle.id)
      setFirstSolve(earlier ?? null)
      setStats(summarise(storeSolve({
        id: puzzle.id, puzzleType: puzzle.puzzleType, size: grid.width,
        elapsedMs: time, hints: 0, solvedAt: when,
      }), puzzleOfToday(new Date(when), timeZone)))
    }
    setMessage(`Solved in ${formatTime(time)}!`)
  }
  const undo = () => {
    if (completed.current) return
    const previous = history.at(-1)
    setHistory(history.slice(0, -1))
    change(previous ?? undoWord(current.current))
    setMessage('Undid the last move.')
  }
  const reset = () => {
    if (completed.current) return
    remember(current.current)
    change(resetWordGame(current.current))
    setMessage('Board cleared. Undo brings it back; the clock keeps running.')
  }
  const share = async (variant: 'result' | 'solution') => {
    const result: ShareResult = {
      puzzleId: puzzle.id, puzzleType: 'word-paths', width: grid.width, height: grid.height,
      elapsedMs: firstSolve?.elapsedMs ?? elapsed, hints: 0, streak: stats?.currentStreak ?? 0,
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
    <div className="word-game">
      <div className="puzzle-tools">
        <span className="timer" role="timer" aria-label="Elapsed active time">{formatTime(elapsed)}</span>
        <button className="tool-button" type="button" onClick={undo} disabled={solved || (history.length === 0 && game.words.length === 0)}>Undo</button>
        <button className="tool-button" type="button" onClick={reset} disabled={solved || (game.words.length === 0 && game.trace.length === 0)}>Reset</button>
      </div>
      {!saving && !solved && <p className="status error" role="status">Progress can&rsquo;t be saved in this browser. Keep this page open to retain it.</p>}
      <WordPathsBoard game={game} locked={solved} instructionsId={instructionsId} onSelect={select}
        onRestoreTrace={restoreTrace} onSubmit={submit} onUndo={undo} />
      <div className="word-selection">
        <output aria-live="polite" aria-label="Selected word">{traced || (solved ? 'All letters used' : 'Select letters')}</output>
        <div className="word-actions">
          <button type="button" className="tool-button" disabled={solved || !game.trace.length} onClick={() => { change(clearTrace(current.current)); setMessage('Selection cleared.') }}>Clear selection</button>
          <button type="button" className="tool-button primary" disabled={solved || !game.trace.length} onClick={submit}>Submit word</button>
        </div>
      </div>
      <ol className="word-slots" aria-label="Words to find">
        {[...grid.wordLengths].sort((a, b) => a - b).map((length) => {
          const path = game.words.find((word) => word.length === length)
          return <li key={length} data-length={path ? length : undefined} className={path ? 'filled' : ''}>
            <span>{length} letters</span><strong>{path ? spellPath(grid, path) : '·'.repeat(length)}</strong>
          </li>
        })}
      </ol>
      <p className="word-feedback" role="status">{message || '\u00a0'}</p>
      <p className="word-instructions" id={instructionsId}>
        Drag adjoining letters and release to submit. Or tap letters, then Submit.
        With a keyboard: arrows move, Space selects, Enter submits; Backspace removes a letter and Escape clears selection.
      </p>
      <p className="word-note">Use every letter once. Accepted words can lead to a dead end; Undo lets you try another path. Only words in this game&rsquo;s English list are accepted.</p>
      <SolvedPanel solved={solved} firstSolve={firstSolve} streak={stats?.currentStreak ?? 0} copied={copied} shareText={shareText} onShare={share} />
    </div>
  )
}
