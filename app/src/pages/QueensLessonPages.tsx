import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { InteractiveBoard } from '../components/InteractiveBoard'
import { TechniqueCelebration, TechniqueProgress } from '../components/TechniqueProgress'
import { hintCellName } from '../domain/hints'
import { QUEENS_LESSONS, QUEENS_TECHNIQUES } from '../domain/queensLessons'
import { readQueensLessons, completeQueensLesson } from '../lib/queensLessonProgress'
import { finishesTechnique } from '../lib/learningAchievements'

const noop = () => {}
const noConflicts = new Set<number>()

export function QueensCoursePage() {
  const [completed] = useState(readQueensLessons)
  return <section className="learn-page">
    <Link className="lesson-back" to="/learn">← All games</Link>
    <h1 className="page-title">Queens techniques</h1>
    <p className="status">{completed.length} of {QUEENS_LESSONS.length} completed · Saved in this browser.</p>
    <ol className="lesson-cards">{QUEENS_TECHNIQUES.map((technique, index) => <li key={technique.id}>
      <p className="eyebrow">Technique {index + 1} · Combine deductions</p><h2>{technique.title}</h2><p>{technique.intro}</p>
      <TechniqueProgress exercises={QUEENS_LESSONS.filter(item => item.technique === technique.id)} completed={completed} />
      <div className="lesson-exercise-links">{QUEENS_LESSONS.filter(item => item.technique === technique.id).map(item =>
        <Link key={item.id} className="tool-button" to={`/learn/queens/${item.id}`}><span>Exercise {item.exerciseNumber} · {item.guidance === 'guided' ? 'Guided' : 'Practice'}</span>
          <span className={completed.includes(item.id) ? 'lesson-completed' : undefined}>{completed.includes(item.id) ? 'Completed' : '→'}</span></Link>)}</div>
    </li>)}</ol>
    <p className="status">The board is prepared for one deduction. Lesson progress is separate from daily games.</p>
  </section>
}

export function QueensLessonPage() {
  const { lessonId } = useParams()
  const lesson = QUEENS_LESSONS.find(item => item.id === lessonId)
  if (!lesson) return <section><h1 className="page-title">Lesson not found</h1><Link to="/learn/queens">All Queens techniques</Link></section>
  return <QueensExercise key={lesson.id} lesson={lesson} />
}

function QueensExercise({ lesson }: { lesson: typeof QUEENS_LESSONS[number] }) {
  const [selected, setSelected] = useState<number | null>(null)
  const [result, setResult] = useState<'idle' | 'incorrect' | 'correct' | 'revealed'>('idle')
  const [clue, setClue] = useState(false), [saveFailed, setSaveFailed] = useState(false)
  const [completed, setCompleted] = useState(readQueensLessons)
  const [newAchievement, setNewAchievement] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { window.scrollTo({ top: 0 }); heading.current?.focus({ preventScroll: true }) }, [])
  const technique = QUEENS_TECHNIQUES.find(item => item.id === lesson.technique)!
  const siblings = QUEENS_LESSONS.filter(item => item.technique === lesson.technique), next = siblings[lesson.exerciseNumber]
  const explained = result === 'correct' || result === 'revealed', showPattern = lesson.guidance === 'guided' || clue || explained
  const target = selected !== null && lesson.answers.includes(selected) ? selected : lesson.answers[0]!
  const game = explained ? { ...lesson.game,
    queens: lesson.action === 'queen' ? new Set([...lesson.game.queens, target]) : lesson.game.queens,
    marks: new Set([...lesson.game.marks, ...lesson.removed, ...(lesson.action === 'x' ? [target] : [])]),
  } : lesson.game
  const check = () => {
    if (selected === null) return
    if (!lesson.answers.includes(selected)) { setResult('incorrect'); return }
    const before = readQueensLessons()
    const saved = completeQueensLesson(lesson.id)
    setResult('correct'); setSaveFailed(!saved)
    setCompleted([...new Set([...completed, ...before, lesson.id])])
    setNewAchievement(saved && finishesTechnique(siblings, before, lesson.id))
  }
  const retry = () => { setSelected(null); setResult('idle'); setClue(false); window.scrollTo({ top: 0 }); heading.current?.focus({ preventScroll: true }) }
  return <section className="lesson-page">
    <header className="lesson-heading"><p className="eyebrow">Queens · Exercise {lesson.exerciseNumber} of {siblings.length} · {lesson.guidance === 'guided' ? 'Guided' : 'Practice'}{completed.includes(lesson.id) && ' · Completed'}</p>
      <Link className="lesson-back" to="/learn/queens">← All techniques</Link><h1 className="page-title" ref={heading} tabIndex={-1}>{technique.title}</h1></header>
    <nav className="lesson-siblings" aria-label={`${technique.title} exercises`}>{siblings.map(item => <Link key={item.id} className="tool-button" to={`/learn/queens/${item.id}`} aria-current={item.id === lesson.id ? 'page' : undefined}>Exercise {item.exerciseNumber}</Link>)}</nav>
    <p className="grid-lesson-mobile-prompt" aria-hidden="true">{lesson.prompt}</p>
    <div className="lesson-workspace"><div className="lesson-board">
      <InteractiveBoard board={lesson.board} game={game} locked conflictCells={noConflicts} hintId="queens-lesson-guide"
        hint={showPattern ? { cell: target, support: lesson.support.filter(cell => cell !== target) } : null}
        inspection={{ selected, onSelect: cell => { if (!explained) { setSelected(cell); setResult('idle') } } }}
        onToggleQueen={noop} onToggleMark={noop} onClear={noop} onRequestHint={noop} onUndo={noop} onRedo={noop} onGestureStart={noop} onPaintCell={noop} onGestureEnd={noop} />
      <p id="queens-lesson-guide" className="lesson-board-guide">Queens and crosses are prepared. Select a cell by touch, click or arrow keys. Blue outline: your selection.{showPattern && ' Green outline: example. Dashed outlines: supporting cells.'}</p>
    </div><section className="lesson-task" aria-labelledby="queens-lesson-idea">
      <h2 id="queens-lesson-idea">The idea</h2><p>{technique.intro}</p>
      {showPattern ? <p className="lesson-cue">Follow the highlighted cells to the example at {hintCellName(lesson.board, target)}.</p>
        : <button type="button" className="tool-button" onClick={() => setClue(true)}>Show a clue</button>}
      <fieldset disabled={explained}><legend>{lesson.prompt}</legend><p>Select a cell on the board, then check your answer.</p>
        <p>{selected === null ? 'Select a cell to begin.' : `Selected ${hintCellName(lesson.board, selected)}.`}</p></fieldset>
      <div className="lesson-actions">{!explained ? <><button type="button" className="tool-button primary" disabled={selected === null} onClick={check}>Check answer</button><button type="button" className="tool-button" onClick={() => setResult('revealed')}>Show explanation</button></>
        : <button type="button" className="tool-button" onClick={retry}>Try again</button>}</div>
      <p className="lesson-feedback" role="status" aria-live="polite">{result === 'incorrect' && 'Not quite. Revisit the reservation and try again.'}{result === 'correct' && 'Lesson complete.'}{result === 'correct' && newAchievement && <TechniqueCelebration title={technique.title} />}{result === 'revealed' && 'Example shown. Try again to practice.'}</p>
      {saveFailed && <p className="status">This browser could not save your completion. It is shown here until you leave this exercise.</p>}
      {explained && <section className="lesson-explanation"><h2>Why it works</h2><ol>{lesson.reasons.map(reason => <li key={reason}>{reason}</li>)}</ol>
        {next ? <Link className="tool-button primary" to={`/learn/queens/${next.id}`} aria-label="Next exercise">Next exercise →</Link> : <Link className="tool-button primary" to="/learn/queens">All techniques →</Link>}</section>}
    </section></div><p className="lesson-note">Practice one deduction. Completion saves separately from daily games.</p>
  </section>
}
