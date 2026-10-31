import { PlayTimer } from './PlayTimer'
import type { Puzzle } from '../domain/puzzle'
import { puzzleOfToday } from '../domain/dates'
import { readStoredStats, storeSolve, summarise, type SolveRecord, type Stats } from '../lib/stats'
import { buildShareText, buildSudokuSolutionShareText, copyText, puzzleShareLink } from '../lib/share'
import { useLeaderboard } from '../lib/useLeaderboard'
import { SolvedPanel } from './SolvedPanel'
import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { createSudokuGame, editSudoku, isSudokuSolved, sudokuCellName, sudokuConflicts, sudokuDigits, sudokuSingle, type SudokuBoard as Board, type SudokuGame } from '../domain/sudoku'
import { applySudokuHint, checkSudokuEntries, findSudokuHint, type SudokuEntryCheck, type SudokuHint } from '../domain/sudokuHints'
import { usePlayClock } from '../lib/usePlayClock'
import { formatTime } from '../domain/game'
import { historyCommand, useMoveHistory } from '../lib/useMoveHistory'
import { readSudokuProgress, storeSudokuProgress } from '../lib/sudokuProgress'
import { HintPanel, MistakeWarning } from './HintPanel'
import { ResetButton } from './ResetButton'
import { SudokuBoard } from './SudokuBoard'
import { KillerCombinations } from './KillerCombinations'
import { editKillerSudoku, isKillerSolved, isKillerSudokuBoard, killerConflicts } from '../domain/killerSudoku'
import { applyKillerSudokuHint, checkKillerSudokuEntries, findKillerSudokuHint } from '../domain/killerSudokuHints'

export function SudokuStage({ board, puzzle }: { board: Board; puzzle?: Puzzle }) {
  const daily = puzzle !== undefined
  const killer = isKillerSudokuBoard(board) ? board : null
  const edit = (game: SudokuGame, cell: number, value: number, pencil = false) => killer ? editKillerSudoku(killer, game, cell, value, pencil) : editSudoku(board, game, cell, value, pencil)
  const [stats, setStats] = useState<Stats | null>(null)
  const [firstSolve, setFirstSolve] = useState<SolveRecord | null>(null)
  const [candidate, setCandidate] = useState<SolveRecord | null>(null)
  const [copied, setCopied] = useState<'idle' | 'result' | 'solution' | 'failed'>('idle')
  const [shareText, setShareText] = useState<string | null>(null)
  const { offerSolve } = useLeaderboard()
  const [initial] = useState(() => readSudokuProgress(board, daily))
  const [game, setGame] = useState(() => initial?.game ?? createSudokuGame(board)), current = useRef(game)
  const history = useMoveHistory<SudokuGame>(), completed = useRef(false), hints = useRef(initial?.hints ?? 0)
  const [shownHints, setShownHints] = useState(initial?.hints ?? 0)
  const [selected, setSelected] = useState(() => Math.max(0, board.givens.indexOf(0)))
  const [selection, setSelection] = useState<readonly number[]>([selected])
  const [showCombinations, setShowCombinations] = useState(false)
  const [pencil, setPencil] = useState(false), [solved, setSolved] = useState(false), [saving, setSaving] = useState(true)
  const [message, setMessage] = useState(''), [hint, setHint] = useState<SudokuHint | null>(null), [mistake, setMistake] = useState<number | null>(null)
  const [progressCheck, setProgressCheck] = useState<SudokuEntryCheck | { kind: 'empty' } | null>(null)
  const [hintSource, setHintSource] = useState<'hint' | 'check'>('hint')
  const stage = useRef<HTMLDivElement>(null), hintButton = useRef<HTMLButtonElement>(null), checkButton = useRef<HTMLButtonElement>(null)
  const instructionsId = useId(), hintId = useId(), combinationsId = useId(), conflicts = killer ? killerConflicts(killer, game.cells) : sudokuConflicts(game.cells)
  const { time, settle, stop, restartAttempt } = usePlayClock(initial ?? { elapsedMs: 0 }, time => {
    setSaving(storeSudokuProgress(board, current.current, time, hints.current, daily))
  })
  const elapsed = time.elapsedMs
  const save = () => { setSaving(storeSudokuProgress(board, current.current, settle(), hints.current, daily)) }
  const clearHint = () => { setHint(null); setMistake(null) }
  const change = (next: SudokuGame) => {
    current.current = next; setGame(next); clearHint(); setProgressCheck(null)
    if (killer ? isKillerSolved(killer, next.cells) : isSudokuSolved(board, next.cells)) {
      const stoppedTime = stop()
      if (puzzle) {
        // oxlint-disable-next-line react/purity -- Called by player events, never during render.
        const when = Date.now(), earlier = readStoredStats().find(record => record.id === puzzle.id)
        const record: SolveRecord = { id: puzzle.id, puzzleType: puzzle.puzzleType, size: 9, ...stoppedTime, hints: hints.current, solvedAt: when }
        setFirstSolve(earlier ?? null)
        setStats(summarise(storeSolve(record), puzzleOfToday(new Date(when), Intl.DateTimeFormat().resolvedOptions().timeZone)))
        if (!earlier) { setCandidate(record); offerSolve(record) }
      }
      completed.current = true; setSolved(true)
    }
    save()
  }
  const commit = (next: SudokuGame, feedback = '') => {
    if (completed.current || next === current.current) return
    history.remember(current.current); change(next); setMessage(feedback)
  }
  const select = (cell: number, extend = false) => {
    setSelected(cell)
    setSelection(previous => extend ? previous.includes(cell) ? previous : [...previous, cell] : [cell])
  }
  const enter = (value: number, cell = selected) => {
    if (selection.length === 1) { commit(edit(current.current, cell, value, pencil)); return }
    const empty = selection.filter(i => current.current.cells[i] === 0), bit = 1 << (value - 1)
    const remove = empty.every(i => current.current.notes[i]! & bit)
    let next = current.current
    for (const i of empty) if (!value || Boolean(next.notes[i]! & bit) === remove) next = edit(next, i, value, true)
    commit(next)
  }
  const confirmNote = (cell: number) => {
    const before = current.current, mask = before.notes[cell] ?? 0
    if (completed.current || board.givens[cell] !== 0 || before.cells[cell] !== 0 || !sudokuSingle(mask)) return
    const value = sudokuDigits(mask)[0]!, next = edit(before, cell, value)
    commit(next)
    if (next !== before && !completed.current) setMessage(`Placed ${value} in ${sudokuCellName(cell).toLowerCase()}. Undo restores the note.`)
  }
  const undo = () => {
    if (completed.current) return
    const next = history.undo(current.current)
    if (next) { change(next); setMessage('Undid the last move.') }
  }
  const redo = () => {
    if (completed.current) return
    const next = history.redo(current.current)
    if (next) { change(next); setMessage('Redid the last move.') }
  }
  const focusHintSource = () => (hintSource === 'check' ? checkButton : hintButton).current?.focus({ preventScroll: true })
  const dismiss = () => { clearHint(); focusHintSource() }
  const checkProgress = () => {
    if (completed.current) return
    clearHint(); setHintSource('check'); setMessage('')
    const entries = current.current.cells.some((value, i) => value !== 0 && board.givens[i] === 0)
    setProgressCheck(!entries ? { kind: 'empty' } : killer ? checkKillerSudokuEntries(killer, current.current) : checkSudokuEntries(board, current.current))
  }
  const requestHint = () => {
    if (completed.current) return
    clearHint(); setProgressCheck(null); setHintSource('hint')
    const result = killer ? findKillerSudokuHint(killer, current.current) : findSudokuHint(board, current.current)
    if (result.kind === 'hint') { setHint(result.hint); hints.current++; setShownHints(hints.current); save(); setMessage('') }
    else if (result.kind === 'mistake') { setMistake(result.cell); setMessage('') }
    else setMessage(result.kind === 'unverified' ? 'The solution check could not verify this board. No mistake or hint has been revealed.'
      : result.kind === 'contradiction' ? 'Your entries lead to a contradiction. Check your numbers or try Undo.'
        : 'These techniques found no further deduction. This does not prove that guessing is necessary.')
  }
  const revealMistake = (cell: number, source: 'hint' | 'check') => {
    if (completed.current) return
    setHintSource(source)
    setHint({ cell, candidates: 0, source: current.current, correction: true, support: [cell],
      reasons: [`The number at ${sudokuCellName(cell).toLowerCase()} disagrees with the independently verified unique solution. Clear this entry before continuing.`] })
    setMistake(null); setProgressCheck(null); hints.current++; setShownHints(hints.current); save()
  }
  const acceptHint = () => {
    if (!hint || completed.current) return
    commit(killer ? applyKillerSudokuHint(killer, current.current, hint) : applySudokuHint(board, current.current, hint), 'Hint applied. Undo restores your previous entry and notes.')
    focusHintSource()
  }
  const showCell = () => {
    const target = stage.current?.querySelector<HTMLElement>('[data-hint="target"]')
    target?.focus({ preventScroll: true }); target?.scrollIntoView({ block: 'center' })
  }
  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && (hint || mistake !== null)) { event.preventDefault(); dismiss(); return }
    const command = historyCommand(event)
    if (command) { event.preventDefault(); if (command === 'undo') undo(); else redo(); return }
    if (event.ctrlKey || event.metaKey || event.altKey || completed.current) return
    const source = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-cell]') : null
    const cell = source ? Number(source.dataset['cell']) : selected
    if (/^[1-9]$/.test(event.key)) { event.preventDefault(); enter(Number(event.key), cell) }
    else if (['0', 'Backspace', 'Delete'].includes(event.key)) { event.preventDefault(); enter(0, cell) }
    else if (event.key.toLowerCase() === 'n') { event.preventDefault(); setPencil(!pencil) }
    else if (event.key.toLowerCase() === 'h') { event.preventDefault(); requestHint() }
  }
  const share = async (variant: 'result' | 'solution') => {
    if (!puzzle) return
    const counted = firstSolve ?? { elapsedMs: elapsed, hints: hints.current }
    const result = { puzzleId: puzzle.id, puzzleType: puzzle.puzzleType, width: 9, height: 9,
      elapsedMs: counted.elapsedMs, hints: counted.hints, streak: stats?.currentStreak ?? 0, link: puzzleShareLink(puzzle.id) }
    const text = variant === 'solution' ? buildSudokuSolutionShareText(result, game.cells) : buildShareText(result)
    const ok = await copyText(text)
    setCopied(ok ? variant : 'failed'); setShareText(ok ? null : text)
    setMessage(ok ? 'Share text copied to the clipboard.' : 'Could not reach the clipboard — the share text is shown below, ready to copy.')
  }
  const cageIndex = killer?.cages.findIndex(cage => selection.every(cell => cage.cells.includes(cell))) ?? -1
  const cage = cageIndex >= 0 ? killer?.cages[cageIndex] : undefined
  const toggleCombination = (mask: number) => {
    if (!killer || cageIndex < 0 || solved) return
    const excluded = killer.cages.map((_, index) => [...(current.current.excludedCageCombinations?.[index] ?? [])])
    const list = excluded[cageIndex]!
    excluded[cageIndex] = list.includes(mask) ? list.filter(item => item !== mask) : [...list, mask]
    commit({ ...current.current, excludedCageCombinations: excluded })
  }
  const resetCombinations = () => {
    if (!killer || cageIndex < 0 || solved || !current.current.excludedCageCombinations?.[cageIndex]?.length) return
    const excluded = killer.cages.map((_, index) => index === cageIndex ? [] : [...(current.current.excludedCageCombinations?.[index] ?? [])])
    commit({ ...current.current, excludedCageCombinations: excluded }, 'Cage combinations restored. Undo brings back your crossed-out combinations.')
  }
  const editable = !solved && (selection.length > 1 ? selection.some(i => game.cells[i] === 0) : board.givens[selected] === 0)
  const placedCounts = Array<number>(10).fill(0)
  for (const value of game.cells) placedCounts[value]!++
  const progressMessage = progressCheck === null ? '' : progressCheck.kind === 'empty' ? 'Add a number before checking your progress.'
    : progressCheck.kind === 'unverified' ? 'We could not verify this puzzle, so progress cannot be checked.'
      : progressCheck.kind === 'correct' ? 'Your entered numbers are correct so far. Notes are not checked.'
        : 'At least one entered number is incorrect. Notes are not checked.'
  return <div className="sudoku-game" ref={stage} onKeyDown={keyboard}>
    <div className="sudoku-workspace" data-killer={!!killer} data-combinations={!!killer && showCombinations}>
      <div className="sudoku-controls">
        <div className="puzzle-tools">
          <PlayTimer time={time} />
          <button type="button" className="tool-button" disabled={solved || !history.canUndo} onClick={undo}>Undo</button>
          <button type="button" className="tool-button" disabled={solved || !history.canRedo} onClick={redo}>Redo</button>
          <ResetButton disabled={solved || game.cells.every((v, i) => v === board.givens[i] && !game.notes[i]) && !game.excludedCageCombinations?.some(items => items.length)}
            onReset={() => { if (completed.current) return; restartAttempt(); commit(createSudokuGame(board), 'Board cleared. Undo restores the board. Total time and hints are kept.') }} />
          <button type="button" className="tool-button notes-toggle" disabled={solved} aria-pressed={pencil} onClick={() => setPencil(!pencil)}>Notes</button>
          <button type="button" className="tool-button" disabled={solved || !game.notes.some(Boolean)} onClick={() => commit({ ...game, notes: Array<number>(81).fill(0) }, 'All notes cleared. Undo brings them back.')}>Clear notes</button>
          <button type="button" className="tool-button" ref={hintButton} disabled={solved} aria-label="Get an explained hint" aria-expanded={(hint !== null || mistake !== null) && hintSource === 'hint'}
            aria-controls={(hint || mistake !== null) && hintSource === 'hint' ? hintId : undefined} onClick={requestHint}>Hint</button>
          <button type="button" className="tool-button sudoku-check-button" ref={checkButton} disabled={solved} aria-label="Check progress" onClick={checkProgress}>Check</button>
          <div className={`sudoku-check-result${progressCheck ? '' : ' sr-only'}`}>
            <p role="status" aria-live="polite">{progressMessage}</p>
            {progressCheck?.kind === 'mistake' && <>
              <button type="button" className="tool-button" onClick={() => revealMistake(progressCheck.cell, 'check')}>Show the mistake</button>
              <span>Revealing the mistake counts as one hint.</span>
            </>}
          </div>
        </div>
        {killer && <button type="button" className="tool-button killer-combinations-toggle" aria-expanded={showCombinations}
          aria-controls={showCombinations ? combinationsId : undefined} onClick={() => setShowCombinations(!showCombinations)}>Combinations</button>}
        <div className="sudoku-keypad" role="group" aria-label={pencil || selection.length > 1 ? 'Note digits' : 'Enter a number'}>
          {Array.from({ length: 9 }, (_, i) => i + 1).map(value => <button type="button" className="tool-button" key={value} disabled={!editable}
            data-all-placed={placedCounts[value]! >= 9} aria-description={`${placedCounts[value]} of 9 placed`}
            aria-label={`Enter ${value}`} onClick={() => enter(value)}>{value}</button>)}
          <button type="button" className="tool-button" disabled={!editable} onClick={() => enter(0)}>Erase</button>
        </div>
        <p className="sudoku-mode" role="status">{selection.length > 1 ? `${selection.length} cells selected · digits update notes in empty cells` : pencil ? 'Notes on · tap digits to mark possibilities' : 'Select a cell, then enter a number'}</p>
      </div>
      <SudokuBoard board={board} game={game} selected={selected} selection={selection} locked={solved} conflicts={conflicts} hint={hint} instructionsId={instructionsId} onSelect={select} onConfirmNote={confirmNote} cageActive={!!cage && showCombinations} />
      {showCombinations && killer && <div id={combinationsId} className="killer-combinations-panel">
        {cage ? <KillerCombinations cage={cage} excluded={game.excludedCageCombinations?.[cageIndex] ?? []} onToggle={toggleCombination} onReset={resetCombinations} disabled={solved} />
          : <section className="killer-combinations" aria-label="Cage combinations"><div className="killer-combinations-heading"><h2>Multiple cages selected</h2></div><p role="status">Select cells from one cage to see its combinations.</p></section>}
      </div>}
    </div>
    <p className={`sudoku-feedback${conflicts.size ? ' error' : ''}`} role="status">{solved ? message || `Solved in ${formatTime(elapsed)} with ${shownHints} hint${shownHints === 1 ? '' : 's'}!${daily ? '' : killer ? ' Choose another board to keep playing.' : ' Choose another level to keep playing.'}`
      : message || (conflicts.size ? killer ? 'Check the highlighted cells: a number is repeated or a cage sum is incorrect.' : `${conflicts.size} cells repeat a number in a row, column or box. You can keep editing or Undo.` : '\u00a0')}</p>
    {daily && <SolvedPanel puzzleId={puzzle?.id} candidate={candidate} solved={solved} firstSolve={firstSolve} streak={stats?.currentStreak ?? 0} copied={copied} shareText={shareText} onShare={share} />}
    {mistake !== null && <MistakeWarning id={hintId} message="Your numbers lead to a contradiction. Check your entries, or try Undo." onReveal={() => revealMistake(mistake, 'hint')} onDismiss={dismiss} />}
    {hint && <HintPanel id={hintId} location={sudokuCellName(hint.cell)} title={hint.correction ? 'Clear this entry' : sudokuSingle(hint.candidates) ? `Place ${sudokuDigits(hint.candidates)[0]}` : 'Narrow the possibilities'}
      reasons={hint.reasons} supportingReasons={hint.supportingReasons} effect={hint.correction || sudokuSingle(hint.candidates) ? '' : `Apply updates this cell's notes to ${sudokuDigits(hint.candidates).join(', ')}. The cell stays empty.`}
      onApply={acceptHint} onDismiss={dismiss} onShowCell={showCell} />}
    {!saving && !solved && <p className="status error" role="status">Progress can&rsquo;t be saved. Keep this page open to retain your attempt.</p>}
    <p className="word-note" id={instructionsId}>Digits 1–9 once in every row, column and 3×3 box. Given numbers are fixed.
      Select a cell, then tap a number. Double-tap or double-click a cell with one note to place it. Drag, Shift-click or Shift-arrow to select multiple cells; digits then update notes in empty cells, and Erase clears their notes.
      Arrows move; 1–9 enter; N toggles notes; Delete erases; H explains a hint; Ctrl/Cmd+Z undoes; Ctrl/Cmd+Shift+Z redoes.</p>
  </div>
}
