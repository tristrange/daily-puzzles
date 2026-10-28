import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { KillerCombinations } from '../components/KillerCombinations'
import { SudokuBoard } from '../components/SudokuBoard'
import { killerCombinations } from '../domain/killerSudoku'
import { KILLER_LESSONS } from '../domain/killerLessons'
import { createSudokuGame } from '../domain/sudoku'
import { completeKillerLesson, readKillerLessons } from '../lib/killerLessonProgress'

export function KillerCoursePage() {
  const [completed] = useState(readKillerLessons)
  return <section className="learn-page">
    <Link to="/learn" className="lesson-back">← All games</Link>
    <h1 className="page-title">Killer Sudoku techniques</h1>
    <p className="status">{completed.length} of {KILLER_LESSONS.length} completed · Saved in this browser.</p>
    <ol className="lesson-cards"><li><p className="eyebrow">Technique 1 · Cage combinations</p>
      <h2>Compare cage combinations</h2>
      <p>List the distinct digits that fit a cage total, then use placed numbers to rule out combinations. For example, four different digits total 10 only as 1 + 2 + 3 + 4.</p>
      <div className="lesson-exercise-links">{KILLER_LESSONS.map((lesson, index) => <Link key={lesson.id} className="tool-button" to={`/learn/killer-sudoku/${lesson.id}`}>
        <span>Exercise {index + 1} · {index === 0 ? 'Guided' : 'Practice'}</span>
        <span className={completed.includes(lesson.id) ? 'lesson-completed' : undefined}>{completed.includes(lesson.id) ? 'Completed' : '→'}</span>
      </Link>)}</div></li></ol>
    <p className="status">Lesson progress is separate from daily games.</p>
  </section>
}

export function KillerLessonPage() {
  const { lessonId } = useParams()
  const index = KILLER_LESSONS.findIndex(lesson => lesson.id === lessonId)
  if (index < 0) return <section><h1 className="page-title">Lesson not found</h1><Link to="/learn/killer-sudoku">All Killer Sudoku techniques</Link></section>
  return <KillerExercise key={lessonId} index={index} />
}

function KillerExercise({ index }: { index: number }) {
  const lesson = KILLER_LESSONS[index]!, cage = lesson.board.cages[lesson.cageIndex]!, target = cage.cells[0]!
  const [crossed, setCrossed] = useState<readonly number[]>([])
  const [result, setResult] = useState<'idle' | 'incorrect' | 'correct' | 'revealed'>('idle')
  const [clue, setClue] = useState(false), [completed, setCompleted] = useState(readKillerLessons), [saveFailed, setSaveFailed] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { window.scrollTo({ top: 0 }); heading.current?.focus({ preventScroll: true }) }, [])
  const explained = result === 'correct' || result === 'revealed', showPattern = index === 0 || clue || explained
  const forbidden = lesson.forbidden.reduce((mask, digit) => mask | (1 << (digit - 1)), 0)
  const expected = killerCombinations(cage).filter(mask => mask & forbidden)
  const game = createSudokuGame(lesson.board)
  const hint = { cell: target, candidates: 0, source: game, reasons: [], support: showPattern ? lesson.support : [] }
  const check = () => {
    if (crossed.length !== expected.length || !expected.every(mask => crossed.includes(mask))) { setResult('incorrect'); return }
    setResult('correct'); setSaveFailed(!completeKillerLesson(lesson.id)); setCompleted([...new Set([...completed, lesson.id])])
  }
  return <section className="lesson-page">
    <header className="lesson-heading"><p className="eyebrow">Killer Sudoku · Exercise {index + 1} of {KILLER_LESSONS.length} · {index === 0 ? 'Guided' : 'Practice'}{completed.includes(lesson.id) && ' · Completed'}</p>
      <Link to="/learn/killer-sudoku" className="lesson-back">← All techniques</Link>
      <h1 className="page-title" ref={heading} tabIndex={-1}>Compare cage combinations</h1></header>
    <nav className="lesson-siblings" aria-label="Cage combination exercises">{KILLER_LESSONS.map((item, i) => <Link key={item.id} className="tool-button" to={`/learn/killer-sudoku/${item.id}`} aria-current={i === index ? 'page' : undefined}>Exercise {i + 1}</Link>)}</nav>
    <div className="lesson-workspace"><div className="lesson-board">
      <SudokuBoard board={lesson.board} game={game} selected={target} selection={[target]} locked conflicts={new Set()} hint={hint} cageActive instructionsId="killer-lesson-guide" onSelect={() => {}} />
      <p id="killer-lesson-guide" className="lesson-board-guide">The shaded cage is the one to inspect.{showPattern && ' Dashed outlines show the relevant placed digits.'}</p>
    </div><section className="lesson-task">
      <h2>The idea</h2><p>{lesson.prompt}</p>
      {showPattern ? <p className="lesson-cue">{lesson.cue}</p> : <button type="button" className="tool-button" onClick={() => setClue(true)}>Show a clue</button>}
      <KillerCombinations cage={cage} excluded={explained ? expected : crossed} disabled={explained} onToggle={mask => { setCrossed(crossed.includes(mask) ? crossed.filter(item => item !== mask) : [...crossed, mask]); setResult('idle') }} onReset={() => { setCrossed([]); setResult('idle') }} />
      <div className="lesson-actions">{!explained ? <><button type="button" className="tool-button primary" onClick={check}>Check answer</button><button type="button" className="tool-button" onClick={() => setResult('revealed')}>Show explanation</button></>
        : <button type="button" className="tool-button" onClick={() => { setCrossed([]); setResult('idle'); setClue(false) }}>Try again</button>}</div>
      <p className="lesson-feedback" role="status" aria-live="polite">{result === 'incorrect' ? 'Not quite. Check the placed digits and try again.' : result === 'correct' ? 'Lesson complete.' : result === 'revealed' ? 'Example shown. Try again to practice.' : ''}</p>
      {saveFailed && <p className="status">This browser could not save your completion.</p>}
      {explained && <section className="lesson-explanation"><h2>Why it works</h2><p>{lesson.explanation}</p>
        {KILLER_LESSONS[index + 1] ? <Link className="tool-button primary" aria-label="Next exercise" to={`/learn/killer-sudoku/${KILLER_LESSONS[index + 1]!.id}`}>Next exercise →</Link> : <Link className="tool-button primary" to="/preview/killer-sudoku">Try a full Killer Sudoku →</Link>}</section>}
    </section></div>
    <p className="lesson-note">Practice one deduction. Completion saves separately from your puzzles.</p>
  </section>
}
