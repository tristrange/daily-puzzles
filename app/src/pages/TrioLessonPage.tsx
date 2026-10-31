import { useEffect, useId, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { TrioBoard, type TrioNoteGesture } from '../components/TrioBoard'
import { TrioSymbol } from '../components/TrioSymbol'
import { TechniqueCelebration } from '../components/TechniqueProgress'
import { editTrio, TRIO_NAMES, trioConflicts, type TrioAction, type TrioGame, type TrioValue } from '../domain/trio'
import { trioCandidateNames, trioCellName } from '../domain/trioHints'
import { applyTrioLessonExample, checkTrioLessonAnswer, TRIO_LESSONS, TRIO_TECHNIQUES, type TrioLesson } from '../domain/trioLessons'
import { readCompletedTrioLessons, storeCompletedTrioLessons } from '../lib/trioLessonProgress'
import { useMoveHistory } from '../lib/useMoveHistory'
import { finishesTechnique } from '../lib/learningAchievements'

type Response = { kind: 'idle' | 'incorrect' } | { kind: 'correct' | 'revealed'; example: TrioLesson['examples'][number] }

export function TrioLessonPage() {
  const { lessonId } = useParams()
  const lesson = TRIO_LESSONS.find(exercise => exercise.id === lessonId)
  const technique = TRIO_TECHNIQUES.find(item => item.exercises.some(exercise => exercise.id === lessonId))
  if (!lesson || !technique) return <section><h1 className="page-title">Lesson not found</h1><Link to="/learn/trio">All Trio techniques</Link></section>
  return <TrioExercise key={lesson.id} lesson={lesson} technique={technique} />
}

function TrioExercise({ lesson, technique }: { lesson: TrioLesson; technique: typeof TRIO_TECHNIQUES[number] }) {
  const [response, setResponse] = useState<Response>({ kind: 'idle' })
  const [game, setGame] = useState(lesson.game), current = useRef(game), before = useRef<TrioGame | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [brush, setBrush] = useState<TrioValue>(lesson.goal.remove), [pencil, setPencil] = useState(true)
  const history = useMoveHistory<TrioGame>(), pickerId = useId()
  const [clueRequested, setClueRequested] = useState(false)
  const [completed, setCompleted] = useState(readCompletedTrioLessons)
  const [saveFailed, setSaveFailed] = useState(false)
  const [newAchievement, setNewAchievement] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { window.scrollTo({ top: 0 }); heading.current?.focus({ preventScroll: true }) }, [])
  const explained = 'example' in response
  const example = explained ? response.example : lesson.examples[0]!
  const showPattern = lesson.guidance === 'guided' || clueRequested || explained
  const board = { ...lesson.board, givens: lesson.game.cells }
  const conflicts = trioConflicts(board, game.cells)
  const next = technique.exercises[lesson.exerciseNumber]
  const change = (nextGame: TrioGame) => { current.current = nextGame; setGame(nextGame) }
  const begin = () => { before.current = current.current; setResponse({ kind: 'idle' }) }
  const apply = (cell: number, action: TrioAction) => change(editTrio(board, current.current, cell, action))
  const end = (cancel: boolean, gesture?: TrioNoteGesture) => {
    const previous = before.current; before.current = null
    if (!previous) return
    if (cancel) change(previous)
    else if (gesture?.kind === 'double' && previous === gesture.first.after) {
      change(editTrio(board, gesture.first.before, gesture.first.cell, { value: gesture.first.symbol }))
    }
    else if (previous !== current.current) history.remember(previous)
    return current.current
  }
  const undo = () => { if (!before.current) { const previous = history.undo(current.current); if (previous) { change(previous); setResponse({ kind: 'idle' }) } } }
  const redo = () => { if (!before.current) { const nextGame = history.redo(current.current); if (nextGame) { change(nextGame); setResponse({ kind: 'idle' }) } } }
  const retry = () => {
    before.current = null; history.clear(); change(lesson.game); setSelected(null); setBrush(lesson.goal.remove); setPencil(true)
    setResponse({ kind: 'idle' }); setClueRequested(false); window.scrollTo({ top: 0 }); heading.current?.focus({ preventScroll: true })
  }
  const check = () => {
    if (before.current) return
    const answer = lesson.examples.find(item => {
      const value = current.current.cells[item.cell]!
      const candidates = value ? 1 << (value - 1) : current.current.notes[item.cell]!
      return checkTrioLessonAnswer(lesson, { cell: item.cell, candidates })
    })
    if (!answer) { setResponse({ kind: 'incorrect' }); return }
    setResponse({ kind: 'correct', example: answer })
    const previousCompletions = readCompletedTrioLessons()
    const ids = [...new Set([...completed, ...previousCompletions, lesson.id])]
    const saved = storeCompletedTrioLessons(ids)
    setCompleted(ids); setSaveFailed(!saved)
    setNewAchievement(saved && finishesTechnique(technique.exercises, previousCompletions, lesson.id))
  }
  const reveal = () => {
    if (before.current) return
    const answer = lesson.examples.find(item => item.cell === selected) ?? lesson.examples[0]!
    change(applyTrioLessonExample(lesson, answer, current.current))
    setResponse({ kind: 'revealed', example: answer })
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
    <p className="trio-lesson-mobile-prompt">In {lesson.scope}, rule out {TRIO_NAMES[lesson.goal.remove]} in a blank.</p>
    <div className="lesson-workspace">
      <div className="trio-lesson-controls">
        <div className="trio-picker" role="radiogroup" aria-label="Symbol to place">
          {([1, 2, 3, 0] as const).map(value => <label key={value} className="trio-pick">
            <input className="sr-only" type="radio" name={pickerId} checked={brush === value} disabled={explained} onChange={() => setBrush(value)} aria-label={value ? TRIO_NAMES[value] : 'Eraser'} />
            <span className="trio-pick-face">{value ? <TrioSymbol value={value} /> : <span aria-hidden="true">⌫</span>}<span>{value ? TRIO_NAMES[value] : 'Erase'}</span></span>
          </label>)}
        </div>
        <div className="lesson-actions">
          <button type="button" className="tool-button notes-toggle" aria-pressed={pencil} disabled={explained} onClick={() => setPencil(!pencil)}>Notes</button>
          <button type="button" className="tool-button" disabled={explained || !history.canUndo} onClick={undo}>Undo</button>
          <button type="button" className="tool-button" disabled={explained || !history.canRedo} onClick={redo}>Redo</button>
        </div>
      </div>
      <div className="lesson-board">
        <TrioBoard board={board} game={game} brush={brush} pencil={pencil} locked={explained}
          conflicts={conflicts} instructionsId="trio-lesson-board-guide" hint={showPattern ? example.hint : null}
          noteShortcut inspection={{ selected: explained ? example.cell : selected, onSelect: setSelected }} onApply={apply} onBegin={begin} onEnd={end} onUndo={undo} onRedo={redo} onPencil={() => setPencil(!pencil)} />
        <p id="trio-lesson-board-guide" className="lesson-board-guide">Prepared symbols are fixed. Choose a symbol, then tap or drag to edit; Notes switches between notes and symbols. Double-tap or double-click a cell with one note to place it. Undo restores your changes. Arrows move; 1–3 edit, N switches Notes, and Delete erases.{showPattern && ' Green outline: example. Dashed outlines: supporting cells.'}</p>
        {conflicts.size > 0 && <p className="status error" role="status">Some working symbols conflict with the rules. You can edit or undo them.</p>}
      </div>
      <section className="lesson-task" aria-labelledby="trio-lesson-idea">
        <h2 id="trio-lesson-idea">The idea</h2><p>{technique.introduction}</p>
        {showPattern ? <p className="lesson-cue">Follow the linked restrictions to the example at {trioCellName(example.cell)}.</p>
          : <button type="button" className="tool-button" onClick={() => setClueRequested(true)}>Show a clue</button>}
        <p>In {lesson.scope}, find a blank where {TRIO_NAMES[lesson.goal.remove]} can be ruled out. Use the board to work through the deduction, then check your answer.</p>
        <p>Check answer looks for that deduction. Your other working notes and symbols are not checked.</p>
        {selected !== null && !explained && <p className="trio-lesson-selection">Last cell: {trioCellName(selected)}.</p>}
        <div className="lesson-actions">
          {!explained && <><button type="button" className="tool-button primary" disabled={game === lesson.game} onClick={check}>Check answer</button>
            <button type="button" className="tool-button" onClick={reveal}>Show explanation</button></>}
          {explained && <button type="button" className="tool-button" onClick={retry}>Try again</button>}
        </div>
        <p className="lesson-feedback" role="status" aria-live="polite">
          {response.kind === 'incorrect' && `Not quite. Find an exclusion in ${lesson.scope} and remove ${TRIO_NAMES[lesson.goal.remove]}.`}
          {response.kind === 'correct' && `Lesson complete. This deduction leaves ${trioCandidateNames(example.candidates)}.`}
          {response.kind === 'correct' && newAchievement && <TechniqueCelebration title={technique.title} />}
          {response.kind === 'revealed' && `Example shown. This deduction leaves ${trioCandidateNames(example.candidates)}. Try again to practice.`}
        </p>
        {saveFailed && <p className="status">This browser could not save your completion. It is shown here until you leave this exercise.</p>}
        {explained && <section className="lesson-explanation" aria-labelledby="trio-lesson-why">
          <h2 id="trio-lesson-why">Why it works</h2><p>The explanation starts from the prepared board.</p><ol className="trio-lesson-reasons">{example.reasons.map((reason, i) => <li key={i}>{reason}</li>)}</ol>
          {next ? <Link className="tool-button primary" to={`/learn/trio/${next.id}`} aria-label="Next exercise">Next exercise →</Link>
            : <div className="lesson-actions"><Link className="tool-button primary" to="/learn/trio">All techniques →</Link><Link className="tool-button" to="/preview/trio">Try a full Trio →</Link></div>}
        </section>}
      </section>
    </div>
    <p className="lesson-note">Your working board resets when you leave. Lesson completion saves separately in this browser.</p>
  </section>
}
