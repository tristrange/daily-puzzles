import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { NurikabeBoard } from '../components/NurikabeBoard'
import { TentsBoard } from '../components/TentsBoard'
import { TracksBoard } from '../components/TracksBoard'
import { TechniqueCelebration, TechniqueProgress } from '../components/TechniqueProgress'
import '../components/Nurikabe.css'
import { GRID_LESSONS, GRID_TECHNIQUES, type GridLesson } from '../domain/gridLessons'
import { readGridLessons, completeGridLesson } from '../lib/gridLessonProgress'
import { finishesTechnique } from '../lib/learningAchievements'

type Kind = GridLesson['kind']
const names = { nurikabe: 'Nurikabe', tents: 'Tents', 'train-tracks': 'Train Tracks' } as const
const noop = () => {}
const noConflicts = new Set<number>()

export function GridCoursePage({ kind }: { kind: Kind }) {
  const lessons = GRID_LESSONS.filter(lesson => lesson.kind === kind)
  const [completed] = useState(() => readGridLessons(kind))
  return <section className="learn-page">
    <Link to="/learn" className="lesson-back">← All games</Link>
    <h1 className="page-title">{names[kind]} techniques</h1>
    <p className="status">{completed.length} of {lessons.length} completed · Saved in this browser.</p>
    <ol className="lesson-cards">{GRID_TECHNIQUES[kind].map((technique, index) => <li key={technique.id}><p className="eyebrow">Technique {index + 1} · Look ahead</p>
      <h2>{technique.title}</h2><p>{technique.intro}</p>
      <TechniqueProgress exercises={lessons.filter(lesson => lesson.technique === technique.id)} completed={completed} />
      <div className="lesson-exercise-links">{lessons.filter(lesson => lesson.technique === technique.id).map(lesson => <Link key={lesson.id} className="tool-button" to={`/learn/${kind}/${lesson.id}`}>
        <span>Exercise {lesson.exerciseNumber} · {lesson.guidance === 'guided' ? 'Guided' : 'Practice'}</span>
        <span className={completed.includes(lesson.id) ? 'lesson-completed' : undefined}>{completed.includes(lesson.id) ? 'Completed' : '→'}</span>
      </Link>)}</div>
    </li>)}</ol>
    <p className="status">The board is prepared for one deduction. Lesson progress is separate from daily games.</p>
  </section>
}

export function GridLessonPage({ kind }: { kind: Kind }) {
  const { lessonId } = useParams()
  const lesson = GRID_LESSONS.find(item => item.kind === kind && item.id === lessonId)
  if (!lesson) return <section><h1 className="page-title">Lesson not found</h1><Link to={`/learn/${kind}`}>All techniques</Link></section>
  return <GridExercise key={lesson.id} lesson={lesson} />
}

function GridExercise({ lesson }: { lesson: GridLesson }) {
  const [selected, setSelected] = useState<number | null>(null)
  const [result, setResult] = useState<'idle' | 'incorrect' | 'correct' | 'revealed'>('idle')
  const [clue, setClue] = useState(false), [saveFailed, setSaveFailed] = useState(false)
  const [completed, setCompleted] = useState(() => readGridLessons(lesson.kind))
  const [newAchievement, setNewAchievement] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { window.scrollTo({ top: 0 }); heading.current?.focus({ preventScroll: true }) }, [])
  const technique = GRID_TECHNIQUES[lesson.kind].find(item => item.id === lesson.technique)!
  const siblings = GRID_LESSONS.filter(item => item.kind === lesson.kind && item.technique === lesson.technique), next = siblings[lesson.exerciseNumber]
  const explained = result === 'correct' || result === 'revealed'
  const answer = lesson.answers.find(item => item.cell === selected) ?? lesson.answers[0]!
  const showPattern = lesson.guidance === 'guided' || clue || explained
  const width = lesson.kind === 'train-tracks' ? lesson.board.width : lesson.board.size
  const location = (cell: number) => `row ${Math.floor(cell / width) + 1}, column ${cell % width + 1}`
  const scope = `${lesson.axis} ${lesson.line + 1}`
  const prompt = lesson.kind === 'train-tracks' ? lesson.prompt : lesson.kind === 'nurikabe'
    ? lesson.prompt ?? `Find a cell in ${scope} that must be sea to keep the sea connected.`
    : lesson.prompt ?? `Find a tent in ${scope} by comparing its possible arrangements.`
  const explanation = lesson.kind === 'train-tracks' ? lesson.reason : lesson.kind === 'nurikabe'
    ? lesson.reason ?? 'The highlighted sea cells must connect. If this cell were land, every possible route between them would be cut off, so it must be sea.'
    : lesson.technique !== 'arrangements' ? lesson.reason : `${lesson.reason}\n${lesson.axis === 'row' ? 'Column' : 'Row'} ${(lesson.axis === 'row' ? answer.cell % lesson.board.size : Math.floor(answer.cell / lesson.board.size)) + 1} is used in every arrangement, so place a tent.`
  const check = () => {
    if (selected === null) return
    if (!lesson.answers.some(item => item.cell === selected)) { setResult('incorrect'); return }
    const before = readGridLessons(lesson.kind)
    const saved = completeGridLesson(lesson.kind, lesson.id)
    setResult('correct'); setSaveFailed(!saved)
    setCompleted([...new Set([...completed, ...before, lesson.id])])
    setNewAchievement(saved && finishesTechnique(siblings, before, lesson.id))
  }
  const retry = () => { setSelected(null); setResult('idle'); setClue(false); window.scrollTo({ top: 0 }); heading.current?.focus({ preventScroll: true }) }
  const inspection = { selected, onSelect: (cell: number) => { if (!explained) { setSelected(cell); setResult('idle') } } }
  return <section className="lesson-page grid-lesson">
    <header className="lesson-heading"><p className="eyebrow">{names[lesson.kind]} · Exercise {lesson.exerciseNumber} of {siblings.length} · {lesson.guidance === 'guided' ? 'Guided' : 'Practice'}{completed.includes(lesson.id) && ' · Completed'}</p>
      <Link className="lesson-back" to={`/learn/${lesson.kind}`}>← All techniques</Link><h1 className="page-title" ref={heading} tabIndex={-1}>{technique.title}</h1></header>
    <nav className="lesson-siblings" aria-label={`${technique.title} exercises`}>{siblings.map(item => <Link key={item.id} className="tool-button" to={`/learn/${lesson.kind}/${item.id}`} aria-current={item.id === lesson.id ? 'page' : undefined}>Exercise {item.exerciseNumber}</Link>)}</nav>
    <p className="grid-lesson-mobile-prompt" aria-hidden="true">{prompt}</p>
    <div className="lesson-workspace"><div className="lesson-board">
      {lesson.kind === 'train-tracks'
        ? <TracksBoard grid={lesson.board} game={explained ? { ...lesson.state, pieces: lesson.state.pieces.map((piece, cell) => cell === answer.cell ? (lesson.answers.find(item => item.cell === answer.cell)?.brush ?? 0) : piece) } : lesson.state}
            brush={0} locked conflicts={[]} hintId="grid-lesson-guide" inspection={inspection}
            hint={showPattern ? { cell: answer.cell, brush: lesson.answers.find(item => item.cell === answer.cell)?.brush ?? 0, source: lesson.state,
              steps: [{ cell: answer.cell, before: 0, after: 0, rule: 'connection', group: answer.support, reason: explanation, dependencies: [] }] } : null}
            onRequestHint={noop} onBrush={noop} onClear={noop} onUndo={noop} onRedo={noop} onGestureStart={noop} onPaint={noop} onGestureEnd={noop} />
        : lesson.kind === 'nurikabe'
        ? <NurikabeBoard board={lesson.board} game={explained ? lesson.state.map((mark, cell) => cell === answer.cell ? lesson.value : mark) : lesson.state} brush={lesson.value} locked conflicts={noConflicts} instructionsId="grid-lesson-guide" inspection={inspection}
            hint={showPattern ? { kind: 'deduction', value: lesson.value, rule: lesson.value === 1 ? 'sea-connection' : 'island-expansion', source: lesson.state, cell: answer.cell, support: answer.support, reason: explanation } : null}
            onBegin={noop} onApply={noop} onEnd={noop} onUndo={noop} onRedo={noop} onHint={noop} />
        : <TentsBoard board={lesson.board} game={explained ? lesson.state.map((mark, cell) => cell === answer.cell ? lesson.value : mark) : lesson.state} brush={lesson.value} locked conflicts={noConflicts} instructionsId="grid-lesson-guide" inspection={inspection}
            hint={showPattern ? { value: lesson.value, cell: answer.cell, support: answer.support, reason: explanation } : null}
            onBegin={noop} onApply={noop} onEnd={noop} onUndo={noop} onRedo={noop} onHint={noop} />}
      <p id="grid-lesson-guide" className="lesson-board-guide">Marks are prepared. Select a cell by touch, click or arrow keys. Blue outline: your selection.{showPattern && ' Green outline: example. Dashed outlines: supporting cells.'}</p>
    </div><section className="lesson-task" aria-labelledby="grid-lesson-idea">
      <h2 id="grid-lesson-idea">The idea</h2><p>{technique.intro}</p>
      {showPattern ? <p className="lesson-cue">Follow the highlighted cells to the example at {location(answer.cell)}.</p>
        : <button type="button" className="tool-button" onClick={() => setClue(true)}>Show a clue</button>}
      <fieldset disabled={explained}><legend>{prompt}</legend><p>Select a cell on the board, then check your answer.</p>
        <p>{selected === null ? 'Select a cell to begin.' : `Selected ${location(selected)}.`}</p></fieldset>
      <div className="lesson-actions">{!explained ? <><button type="button" className="tool-button primary" disabled={selected === null} onClick={check}>Check answer</button><button type="button" className="tool-button" onClick={() => setResult('revealed')}>Show explanation</button></>
        : <button type="button" className="tool-button" onClick={retry}>Try again</button>}</div>
      <p className="lesson-feedback" role="status" aria-live="polite">{result === 'incorrect' && 'Not quite. Revisit the pattern and try again.'}{result === 'correct' && 'Lesson complete.'}{result === 'correct' && newAchievement && <TechniqueCelebration title={technique.title} />}{result === 'revealed' && 'Example shown. Try again to practice.'}</p>
      {saveFailed && <p className="status">This browser could not save your completion. It is shown here until you leave this exercise.</p>}
      {explained && <section className="lesson-explanation"><h2>Why it works</h2>{explanation.split('\n').map(line => <p key={line}>{line}</p>)}
        {next ? <Link className="tool-button primary" to={`/learn/${lesson.kind}/${next.id}`} aria-label="Next exercise">Next exercise →</Link>
          : <Link className="tool-button primary" to={`/learn/${lesson.kind}`}>All techniques →</Link>}</section>}
    </section></div>
    <p className="lesson-note">Practice one deduction. Completion saves separately from daily games.</p>
  </section>
}
