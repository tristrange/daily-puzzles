import { useState } from 'react'
import { Link } from 'react-router-dom'
import { SudokuBoard } from '../components/SudokuBoard'
import { formatPuzzleLabel } from '../domain/dates'
import { previewDeduction } from '../domain/dailyDeduction'
import { sudokuCellName, sudokuDigits } from '../domain/sudoku'
import type { SudokuLesson } from '../domain/sudokuLessons'
import { useToday } from '../lib/useToday'

export function DeductionPreviewPage() {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const today = useToday(timeZone)
  return <DeductionExercise key={today} lesson={previewDeduction(today)} day={today} timeZone={timeZone} />
}

function DeductionExercise({ lesson, day, timeZone }: {
  readonly lesson: SudokuLesson
  readonly day: string
  readonly timeZone: string
}) {
  const { board, step } = lesson
  const [selected, setSelected] = useState(step.cell)
  const [answer, setAnswer] = useState(step.before)
  const [result, setResult] = useState<'idle' | 'incorrect' | 'correct' | 'revealed'>('idle')
  const [showClue, setShowClue] = useState(false)
  const explained = result === 'correct' || result === 'revealed'
  const remaining = sudokuDigits(step.after)
  const candidateLabel = remaining.length === 1 ? 'a candidate' : 'candidates'
  const game = { cells: lesson.game.cells,
    notes: lesson.game.notes.map((mask, cell) => cell === step.cell ? (explained ? step.after : answer) : mask) }
  const hint = { cell: step.cell, candidates: step.after, source: game, reasons: [step.reason],
    support: showClue || explained ? lesson.support : [] }
  const reset = () => { setAnswer(step.before); setResult('idle'); setShowClue(false); setSelected(step.cell) }

  return <section className="lesson-page deduction-preview">
    <header className="lesson-heading">
      <p className="eyebrow">{formatPuzzleLabel(day, timeZone)} · Sudoku · Preview</p>
      <Link to="/" className="lesson-back">← Today&rsquo;s puzzles</Link>
      <h1 className="page-title">Today&rsquo;s deduction</h1>
    </header>
    <div className="lesson-workspace">
      <div className="lesson-board">
        <SudokuBoard board={board} game={game} selected={selected} selection={[selected]} locked conflicts={new Set()}
          hint={hint} instructionsId="deduction-board-guide" onSelect={setSelected} />
        <p id="deduction-board-guide" className="sr-only">Solid outline: target{showClue || explained ? ' · Dashed: pattern' : ''}. The notes are prepared for this position.</p>
      </div>
      <section className="lesson-task" aria-labelledby="deduction-task">
        <h2 id="deduction-task" className="sr-only">Find the deduction</h2>
        <fieldset disabled={explained}>
          <legend>Remove one candidate from {sudokuCellName(step.cell).toLowerCase()}.</legend>
          <p>Tap a digit to remove it.</p>
          <div className="lesson-candidates">
            {sudokuDigits(step.before).map(digit => <button key={digit} type="button" className="tool-button" aria-label={`Keep ${digit}`}
              aria-pressed={!!((explained ? step.after : answer) & (1 << (digit - 1)))}
              onClick={() => { setAnswer(answer ^ (1 << (digit - 1))); setResult('idle') }}>{digit}</button>)}
          </div>
        </fieldset>
        <div className="lesson-actions">
          {!explained && <><button type="button" className="tool-button primary" onClick={() => setResult(answer === step.after ? 'correct' : 'incorrect')}>Check answer</button>
            {!showClue && <button type="button" className="tool-button" onClick={() => setShowClue(true)}>Show a clue</button>}
            <button type="button" className="tool-button" onClick={() => setResult('revealed')}>Show explanation</button></>}
          {explained && <button type="button" className="tool-button" onClick={reset}>Try again</button>}
        </div>
        {showClue && !explained && <p className="lesson-cue">{lesson.cue} Dashed outlines mark the pattern.</p>}
        <p className="lesson-feedback" role="status" aria-live="polite">
          {result === 'incorrect' && 'That does not match the deduction this preview checks. Another valid deduction may exist. Try again or show a clue.'}
          {result === 'correct' && `Correct! This deduction leaves ${remaining.join(', ')} as ${candidateLabel} for ${sudokuCellName(step.cell).toLowerCase()}.`}
          {result === 'revealed' && `This deduction leaves ${remaining.join(', ')} as ${candidateLabel}.`}
        </p>
        {explained && <section className="lesson-explanation" aria-labelledby="deduction-why">
          <h2 id="deduction-why">Why it works · {lesson.title}</h2>
          <p>{step.reason}</p>
          <Link className="tool-button" to={`/learn/sudoku/${lesson.id}`}>Practice this technique →</Link>
        </section>}
      </section>
    </div>
    <p className="lesson-note">Preview: nine existing lesson positions rotate daily. Answers and scores are not saved.</p>
  </section>
}
