import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { SudokuBoard } from '../components/SudokuBoard'
import { sudokuCellName, sudokuDigits } from '../domain/sudoku'
import { SUDOKU_LESSONS, SUDOKU_TECHNIQUES, type SudokuLesson } from '../domain/sudokuLessons'
import { readCompletedLessons, storeCompletedLessons } from '../lib/lessonProgress'

export function SudokuLessonPage() {
  const { lessonId } = useParams()
  const lesson = SUDOKU_LESSONS.find(lesson => lesson.id === lessonId)
  if (!lesson) return <section><h1 className="page-title">Lesson not found</h1><Link to="/learn/sudoku">All Sudoku techniques</Link></section>
  return <LessonExercise key={lesson.id} lesson={lesson} />
}

function LessonExercise({ lesson }: { lesson: SudokuLesson }) {
  const { board, step } = lesson
  const technique = SUDOKU_TECHNIQUES.find(technique => technique.id === lesson.techniqueId)!
  const next = technique.exercises[lesson.exerciseNumber]
  const [selected, setSelected] = useState(step.cell)
  const [answer, setAnswer] = useState(step.before)
  const [result, setResult] = useState<'idle' | 'incorrect' | 'correct' | 'revealed'>('idle')
  const [completed, setCompleted] = useState(readCompletedLessons)
  const [saveFailed, setSaveFailed] = useState(false)
  const [clueRequested, setClueRequested] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { window.scrollTo({ top: 0 }); heading.current?.focus({ preventScroll: true }) }, [])
  const explained = result === 'correct' || result === 'revealed'
  const showPattern = lesson.guidance === 'guided' || clueRequested || explained
  const game = explained ? { cells: lesson.game.cells, notes: lesson.game.notes.map((mask, cell) => cell === step.cell ? step.after : mask) } : lesson.game
  const hint = { cell: step.cell, candidates: step.after, source: game, reasons: [step.reason], support: showPattern ? lesson.support : [] }
  const check = () => {
    if (answer !== step.after) { setResult('incorrect'); return }
    setResult('correct')
    const ids = [...new Set([...completed, ...readCompletedLessons(), lesson.id])]
    setCompleted(ids); setSaveFailed(!storeCompletedLessons(ids))
  }
  return <section className="lesson-page">
    <header className="lesson-heading">
      <p className="eyebrow">Sudoku · Exercise {lesson.exerciseNumber} of {technique.exercises.length} · {lesson.guidance === 'guided' ? 'Guided' : 'Practice'}{completed.includes(lesson.id) && ' · Completed'}</p>
      <Link to="/learn/sudoku" className="lesson-back" aria-label="All techniques">← All techniques</Link>
      <h1 className="page-title" ref={heading} tabIndex={-1}>{lesson.title}</h1>
    </header>
    <nav className="lesson-siblings" aria-label={`${lesson.title} exercises`}>
      {technique.exercises.map(exercise => <Link key={exercise.id} className="tool-button" to={`/learn/sudoku/${exercise.id}`}
        aria-current={exercise.id === lesson.id ? 'page' : undefined}>Exercise {exercise.exerciseNumber}</Link>)}
    </nav>
    <div className="lesson-workspace">
      <div className="lesson-board">
        <SudokuBoard board={board} game={game} selected={selected} selection={[selected]} locked conflicts={new Set()}
          hint={hint} instructionsId="lesson-board-guide" onSelect={setSelected} />
        <p id="lesson-board-guide" className="lesson-board-guide">Solid outline: target{showPattern ? ' · Dashed: pattern' : ''}. Notes are prepared; the board is for inspection.</p>
      </div>
      <section className="lesson-task" aria-labelledby="lesson-idea">
        <h2 id="lesson-idea">The idea</h2>
        <p>{lesson.introduction}</p>
        {showPattern ? <p className="lesson-cue">{lesson.cue}</p>
          : <button type="button" className="tool-button" onClick={() => setClueRequested(true)}>Show a clue</button>}
        <fieldset disabled={explained}>
          <legend>Which candidates can remain in {sudokuCellName(step.cell).toLowerCase()}?</legend>
          <p>Tap a digit to keep or remove it. Keep every candidate this pattern still allows.</p>
          <div className="lesson-candidates">
            {sudokuDigits(step.before).map(digit => <button key={digit} type="button" className="tool-button" aria-label={`Keep ${digit}`}
              aria-pressed={!!((explained ? step.after : answer) & (1 << (digit - 1)))} onClick={() => { setAnswer(answer ^ (1 << (digit - 1))); setResult('idle') }}>{digit}</button>)}
          </div>
        </fieldset>
        <div className="lesson-actions">
          {!explained && <><button type="button" className="tool-button primary" onClick={check}>Check answer</button>
            <button type="button" className="tool-button" onClick={() => setResult('revealed')}>Show explanation</button></>}
          {explained && <button type="button" className="tool-button" onClick={() => { setAnswer(step.before); setSelected(step.cell); setResult('idle'); setClueRequested(false) }}>Try again</button>}
        </div>
        <p className="lesson-feedback" role="status" aria-live="polite">
          {result === 'incorrect' && 'Not quite. Revisit the pattern and try again, or open the explanation.'}
          {result === 'correct' && `Lesson complete. ${sudokuCellName(step.cell)} can retain ${sudokuDigits(step.after).join(', ')}.`}
          {result === 'revealed' && `The remaining candidates are ${sudokuDigits(step.after).join(', ')}. Try again to practice this deduction.`}
        </p>
        {saveFailed && <p className="status">This browser could not save your completion. It is shown here until you leave this exercise.</p>}
        {explained && <section className="lesson-explanation" aria-labelledby="lesson-why">
          <h2 id="lesson-why">Why it works</h2><p>{step.reason}</p>
          {next ? <Link className="tool-button primary" to={`/learn/sudoku/${next.id}`} aria-label="Next exercise">Next exercise →</Link>
            : <div className="lesson-actions"><Link className="tool-button primary" to="/learn/sudoku">All techniques →</Link>
              <Link className="tool-button" to="/preview/sudoku">Try a full Sudoku →</Link></div>}
        </section>}
      </section>
    </div>
    <p className="lesson-note">Practice one deduction, rather than solve the full board. Completion saves separately in this browser.</p>
  </section>
}
