import { useId, useRef, useState, type KeyboardEvent } from 'react'
import { createSudokuGame, editSudoku, isSudokuSolved, sudokuCellName, sudokuConflicts, sudokuDigits, sudokuSingle, type SudokuBoard as Board, type SudokuGame } from '../domain/sudoku'
import { applySudokuHint, findSudokuHint, type SudokuHint } from '../domain/sudokuHints'
import { usePlayClock } from '../lib/usePlayClock'
import { formatTime } from '../domain/game'
import { historyCommand, useMoveHistory } from '../lib/useMoveHistory'
import { readSudokuProgress, storeSudokuProgress } from '../lib/sudokuProgress'
import { HintPanel, MistakeWarning } from './HintPanel'
import { ResetButton } from './ResetButton'
import { SudokuBoard } from './SudokuBoard'

export function SudokuStage({ board }: { board: Board }) {
  const [initial] = useState(() => readSudokuProgress(board))
  const [game, setGame] = useState(() => initial?.game ?? createSudokuGame(board)), current = useRef(game)
  const history = useMoveHistory<SudokuGame>(), completed = useRef(false), hints = useRef(initial?.hints ?? 0)
  const [shownHints, setShownHints] = useState(initial?.hints ?? 0)
  const [selected, setSelected] = useState(() => Math.max(0, board.givens.indexOf(0)))
  const [pencil, setPencil] = useState(false), [solved, setSolved] = useState(false), [saving, setSaving] = useState(true)
  const [message, setMessage] = useState(''), [hint, setHint] = useState<SudokuHint | null>(null), [mistake, setMistake] = useState<number | null>(null)
  const stage = useRef<HTMLDivElement>(null), hintButton = useRef<HTMLButtonElement>(null)
  const instructionsId = useId(), hintId = useId(), conflicts = sudokuConflicts(game.cells)
  const { elapsed, settle, stop } = usePlayClock(initial?.elapsedMs ?? 0, time => {
    setSaving(storeSudokuProgress(board, current.current, time, hints.current))
  })
  const save = () => { setSaving(storeSudokuProgress(board, current.current, settle(), hints.current)) }
  const clearHint = () => { setHint(null); setMistake(null) }
  const change = (next: SudokuGame) => {
    current.current = next; setGame(next); clearHint()
    if (isSudokuSolved(board, next.cells)) { stop(); completed.current = true; setSolved(true) }
    save()
  }
  const commit = (next: SudokuGame, feedback = '') => {
    if (completed.current || next === current.current) return
    history.remember(current.current); change(next); setMessage(feedback)
  }
  const enter = (value: number, cell = selected) => commit(editSudoku(board, current.current, cell, value, pencil))
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
  const dismiss = () => { clearHint(); hintButton.current?.focus({ preventScroll: true }) }
  const requestHint = () => {
    if (completed.current) return
    clearHint()
    const result = findSudokuHint(board, current.current)
    if (result.kind === 'hint') { setHint(result.hint); hints.current++; setShownHints(hints.current); save(); setMessage('') }
    else if (result.kind === 'mistake') { setMistake(result.cell); setMessage('') }
    else setMessage(result.kind === 'unverified' ? 'The solution check could not verify this board. No mistake or hint has been revealed.'
      : result.kind === 'contradiction' ? 'Your entries lead to a contradiction. Check your numbers or try Undo.'
        : 'These techniques found no further deduction. This does not prove that guessing is necessary.')
  }
  const revealMistake = () => {
    if (mistake === null || completed.current) return
    setHint({ cell: mistake, candidates: 0, source: current.current, correction: true, support: [mistake],
      reasons: [`The number at ${sudokuCellName(mistake).toLowerCase()} disagrees with the independently verified unique solution. Clear this entry before continuing.`] })
    setMistake(null); hints.current++; setShownHints(hints.current); save()
  }
  const acceptHint = () => {
    if (!hint || completed.current) return
    commit(applySudokuHint(board, current.current, hint), 'Hint applied. Undo restores your previous entry and notes.')
    hintButton.current?.focus({ preventScroll: true })
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
  const editable = !solved && board.givens[selected] === 0
  return <div className="sudoku-game" ref={stage} onKeyDown={keyboard}>
    <div className="sudoku-workspace">
      <div className="sudoku-controls">
        <div className="puzzle-tools">
          <span className="timer" role="timer" aria-label="Elapsed active time">{formatTime(elapsed)}</span>
          <button type="button" className="tool-button" disabled={solved || !history.canUndo} onClick={undo}>Undo</button>
          <button type="button" className="tool-button" disabled={solved || !history.canRedo} onClick={redo}>Redo</button>
          <ResetButton disabled={solved || game.cells.every((v, i) => v === board.givens[i] && !game.notes[i])}
            onReset={() => commit(createSudokuGame(board), 'Board cleared. Undo brings it back; the clock keeps running.')} />
          <button type="button" className="tool-button" disabled={solved} aria-pressed={pencil} onClick={() => setPencil(!pencil)}>Notes</button>
          <button type="button" className="tool-button" disabled={solved || !game.notes.some(Boolean)} onClick={() => commit({ cells: game.cells, notes: Array<number>(81).fill(0) }, 'All notes cleared. Undo brings them back.')}>Clear notes</button>
          <button type="button" className="tool-button" ref={hintButton} disabled={solved} aria-label="Get an explained hint" aria-expanded={hint !== null || mistake !== null}
            aria-controls={hint || mistake !== null ? hintId : undefined} onClick={requestHint}>Hint</button>
        </div>
        <div className="sudoku-keypad" role="group" aria-label={pencil ? 'Note digits' : 'Enter a number'}>
          {Array.from({ length: 9 }, (_, i) => i + 1).map(value => <button type="button" className="tool-button" key={value} disabled={!editable}
            aria-label={`Enter ${value}`} onClick={() => enter(value)}>{value}</button>)}
          <button type="button" className="tool-button" disabled={!editable} onClick={() => enter(0)}>Erase</button>
        </div>
        <p className="sudoku-mode">{pencil ? 'Notes on · tap digits to mark possibilities' : 'Select a cell, then enter a number'}</p>
      </div>
      <SudokuBoard board={board} game={game} selected={selected} locked={solved} conflicts={conflicts} hint={hint} instructionsId={instructionsId} onSelect={setSelected} />
    </div>
    <p className={`sudoku-feedback${conflicts.size ? ' error' : ''}`} role="status">{solved ? `Solved in ${formatTime(elapsed)} with ${shownHints} hint${shownHints === 1 ? '' : 's'}! Choose another level to keep playing.`
      : message || (conflicts.size ? `${conflicts.size} cells repeat a number in a row, column or box. You can keep editing or Undo.` : '\u00a0')}</p>
    {mistake !== null && <MistakeWarning id={hintId} message="Your numbers lead to a contradiction. Check your entries, or try Undo." onReveal={revealMistake} onDismiss={dismiss} />}
    {hint && <HintPanel id={hintId} location={sudokuCellName(hint.cell)} title={hint.correction ? 'Clear this entry' : sudokuSingle(hint.candidates) ? `Place ${sudokuDigits(hint.candidates)[0]}` : 'Narrow the possibilities'}
      reasons={hint.reasons} supportingReasons={hint.supportingReasons} effect={hint.correction || sudokuSingle(hint.candidates) ? '' : `Apply updates this cell's notes to ${sudokuDigits(hint.candidates).join(', ')}. The cell stays empty.`}
      onApply={acceptHint} onDismiss={dismiss} onShowCell={showCell} />}
    {!saving && !solved && <p className="status error" role="status">Progress can&rsquo;t be saved. Keep this page open to retain your attempt.</p>}
    <p className="word-note" id={instructionsId}>Digits 1–9 once in every row, column and 3×3 box. Given numbers are fixed.
      Select a cell, then tap a number. Arrows move; 1–9 enter; N toggles notes; Delete erases; H explains a hint; Ctrl/Cmd+Z undoes; Ctrl/Cmd+Shift+Z redoes.</p>
  </div>
}
