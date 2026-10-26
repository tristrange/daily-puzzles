import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { TrioBoard } from '../components/TrioBoard'
import { TrioSymbol } from '../components/TrioSymbol'
import { TRIO_NAMES } from '../domain/trio'
import { trioCandidateNames, trioCellName } from '../domain/trioHints'
import { applyTrioLessonExample, checkTrioLessonAnswer, TRIO_LESSONS, TRIO_TECHNIQUES, type TrioLesson } from '../domain/trioLessons'
import { readCompletedTrioLessons, storeCompletedTrioLessons } from '../lib/trioLessonProgress'

const noop = () => {}
const noConflicts = new Set<number>()
type Response = { kind: 'idle' | 'incorrect'; cell: number | null; candidates: number } | { kind: 'correct' | 'revealed'; example: TrioLesson['examples'][number] }

export function TrioLessonPage() {
  const { lessonId } = useParams()
  const lesson = TRIO_LESSONS.find(exercise => exercise.id === lessonId)
  const technique = TRIO_TECHNIQUES.find(item => item.exercises.some(exercise => exercise.id === lessonId))
  if (!lesson || !technique) return <section><h1 className="page-title">Lesson not found</h1><Link to="/learn/trio">All Trio techniques</Link></section>
  return <TrioExercise key={lesson.id} lesson={lesson} technique={technique} />
}

function TrioExercise({ lesson, technique }: { lesson: TrioLesson; technique: typeof TRIO_TECHNIQUES[number] }) {
  const [response, setResponse] = useState<Response>({ kind: 'idle', cell: null, candidates: 0 })
  const [clueRequested, setClueRequested] = useState(false)
  const [completed, setCompleted] = useState(readCompletedTrioLessons)
  const [saveFailed, setSaveFailed] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { window.scrollTo({ top: 0 }); heading.current?.focus({ preventScroll: true }) }, [])
  const explained = 'example' in response
  const example = explained ? response.example : lesson.examples[0]!
  const showPattern = lesson.guidance === 'guided' || clueRequested || explained
  const selected = explained ? response.example.cell : response.cell
  const candidates = explained ? response.example.candidates : response.candidates
  const eligible = selected !== null && lesson.game.cells[selected] === 0
  const next = technique.exercises[lesson.exerciseNumber]
  const select = (cell: number) => { if (!explained) setResponse({ kind: 'idle', cell, candidates: lesson.game.notes[cell]! }) }
  const retry = () => { setResponse({ kind: 'idle', cell: null, candidates: 0 }); setClueRequested(false); window.scrollTo({ top: 0 }); heading.current?.focus({ preventScroll: true }) }
  const check = () => {
    if ('example' in response || response.cell === null) return
    if (!checkTrioLessonAnswer(lesson, { cell: response.cell, candidates: response.candidates })) { setResponse({ ...response, kind: 'incorrect' }); return }
    const cell = response.cell
    const answer = lesson.examples.find(example => example.cell === cell)!
    setResponse({ kind: 'correct', example: answer })
    const ids = [...new Set([...completed, ...readCompletedTrioLessons(), lesson.id])]
    setCompleted(ids); setSaveFailed(!storeCompletedTrioLessons(ids))
  }
  return <section className="lesson-page trio-lesson">
    <header className="lesson-heading">
      <p className="eyebrow">Trio · Exercise {lesson.exerciseNumber} of {technique.exercises.length} · {lesson.guidance === 'guided' ? 'Guided' : 'Practice'}{completed.includes(lesson.id) && ' · Completed'}</p>
      <Link to="/learn/trio" className="lesson-back" aria-label="All Trio techniques">← All techniques</Link>
      <h1 className="page-title" ref={heading} tabIndex={-1}>{technique.title}</h1>
    </header>
    <nav className="lesson-siblings" aria-label={`${technique.title} exercises`}>
      {technique.exercises.map(exercise => <Link key={exercise.id} className="tool-button" to={`/learn/trio/${exercise.id}`} aria-current={exercise.id === lesson.id ? 'page' : undefined}>Exercise {exercise.exerciseNumber}</Link>)}
    </nav>
    <div className="lesson-workspace">
      <div className="lesson-board">
        <TrioBoard board={lesson.board} game={explained ? applyTrioLessonExample(lesson, example) : lesson.game} brush={0} pencil={false} locked
          conflicts={noConflicts} instructionsId="trio-lesson-board-guide" hint={showPattern ? example.hint : null}
          inspection={{ selected, onSelect: select }} onApply={noop} onBegin={noop} onEnd={noop} onUndo={noop} onRedo={noop} onPencil={noop} />
        <p id="trio-lesson-board-guide" className="lesson-board-guide">Symbols and notes are prepared. Select a cell by touch, click or arrow keys. Blue border: your selection.{showPattern && ' Green outline: example. Dashed outline: supporting cells.'}</p>
      </div>
      <section className="lesson-task" aria-labelledby="trio-lesson-idea">
        <h2 id="trio-lesson-idea">The idea</h2><p>{technique.introduction}</p>
        {showPattern ? <p className="lesson-cue">Follow the linked restrictions to the example at {trioCellName(example.cell)}.</p>
          : <button type="button" className="tool-button" onClick={() => setClueRequested(true)}>Show a clue</button>}
        <fieldset disabled={explained}>
          <legend>In {lesson.scope}, find a blank where {TRIO_NAMES[lesson.goal.remove]} can be ruled out.</legend>
          <p>Remove only {TRIO_NAMES[lesson.goal.remove]}. Keep every other displayed candidate, even if a later deduction could narrow it further.</p>
          <p className="trio-lesson-selection">{selected === null ? 'Select a cell on the board to begin.' : `Selected ${trioCellName(selected)}.${!eligible && !explained ? ' Choose a blank with candidate notes.' : ''}`}</p>
          {eligible && <div className="lesson-candidates trio-lesson-candidates" aria-label="Candidates to keep">
            {([1, 2, 3] as const).filter(symbol => lesson.game.notes[selected!]! & (1 << (symbol - 1))).map(symbol => <button type="button" className="tool-button" key={symbol}
              aria-label={`Keep ${TRIO_NAMES[symbol]}`} aria-pressed={!!(candidates & (1 << (symbol - 1)))}
              onClick={() => { if (!explained) setResponse({ kind: 'idle', cell: selected, candidates: candidates ^ (1 << (symbol - 1)) }) }}><TrioSymbol value={symbol} />{TRIO_NAMES[symbol]}</button>)}
          </div>}
        </fieldset>
        <div className="lesson-actions">
          {!explained && <><button type="button" className="tool-button primary" disabled={!eligible} onClick={check}>Check answer</button>
            <button type="button" className="tool-button" onClick={() => setResponse({ kind: 'revealed', example: lesson.examples.find(example => example.cell === selected) ?? lesson.examples[0]! })}>Show explanation</button></>}
          {explained && <button type="button" className="tool-button" onClick={retry}>Try again</button>}
        </div>
        <p className="lesson-feedback" role="status" aria-live="polite">
          {response.kind === 'incorrect' && `Not quite. Find an exclusion in ${lesson.scope}, remove only ${TRIO_NAMES[lesson.goal.remove]}, and keep the other notes.`}
          {response.kind === 'correct' && `Lesson complete. Remaining candidates: ${trioCandidateNames(example.candidates)}.`}
          {response.kind === 'revealed' && `Example shown. Remaining candidates: ${trioCandidateNames(example.candidates)}. Try again to practice.`}
        </p>
        {saveFailed && <p className="status">This browser could not save your completion. It is shown here until you leave this exercise.</p>}
        {explained && <section className="lesson-explanation" aria-labelledby="trio-lesson-why">
          <h2 id="trio-lesson-why">Why it works</h2><ol className="trio-lesson-reasons">{example.reasons.map((reason, i) => <li key={i}>{reason}</li>)}</ol>
          {next ? <Link className="tool-button primary" to={`/learn/trio/${next.id}`} aria-label="Next exercise">Next exercise →</Link>
            : <div className="lesson-actions"><Link className="tool-button primary" to="/learn/trio">All techniques →</Link><Link className="tool-button" to="/preview/trio">Try a full Trio →</Link></div>}
        </section>}
      </section>
    </div>
    <p className="lesson-note">Practice one deduction. Completion saves separately in this browser.</p>
  </section>
}
