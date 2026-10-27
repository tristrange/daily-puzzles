import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { InteractiveBoard } from '../components/InteractiveBoard'
import { hintCellName, type Hint } from '../domain/hints'
import { STAR_BATTLE_LESSONS, STAR_BATTLE_TECHNIQUES, starLessonGroupName, type StarBattleLesson } from '../domain/starBattleLessons'
import { readCompletedStarBattleLessons, storeCompletedStarBattleLessons } from '../lib/starBattleLessonProgress'
import { STAR_BATTLE_CHAINS } from '../domain/starBattleChains'
import { StarBattleChainExercise } from './StarBattleChainExercise'

const noop = () => {}
const noConflicts = new Set<number>()

export function StarBattleLessonPage() {
  const { lessonId } = useParams()
  const chain = STAR_BATTLE_CHAINS.find(exercise => exercise.id === lessonId)
  if (chain) return <StarBattleChainExercise key={chain.id} lesson={chain} />
  const lesson = STAR_BATTLE_LESSONS.find(exercise => exercise.id === lessonId)
  const technique = STAR_BATTLE_TECHNIQUES.find(item => item.exercises.some(exercise => exercise.id === lessonId))
  if (!lesson || !technique) return <section><h1 className="page-title">Lesson not found</h1><Link to="/learn/star-battle">All Star Battle techniques</Link></section>
  return <StarBattleExercise key={lesson.id} lesson={lesson} technique={technique} />
}

function StarBattleExercise({ lesson, technique }: { lesson: StarBattleLesson; technique: typeof STAR_BATTLE_TECHNIQUES[number] }) {
  const { board, hint } = lesson
  const next = technique.exercises[lesson.exerciseNumber]
  const [answer, setAnswer] = useState<Hint['action'] | null>(null)
  const [result, setResult] = useState<'idle' | 'incorrect' | 'correct' | 'revealed'>('idle')
  const [clueRequested, setClueRequested] = useState(false)
  const [completed, setCompleted] = useState(readCompletedStarBattleLessons)
  const [saveFailed, setSaveFailed] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { window.scrollTo({ top: 0 }); heading.current?.focus({ preventScroll: true }) }, [])
  const explained = result === 'correct' || result === 'revealed'
  const showPattern = lesson.guidance === 'guided' || clueRequested || explained
  const game = explained ? {
    ...lesson.game,
    queens: hint.action === 'queen' ? new Set([...lesson.game.queens, hint.cell]) : lesson.game.queens,
    marks: hint.action === 'x' ? new Set([...lesson.game.marks, hint.cell]) : lesson.game.marks,
  } : lesson.game
  const check = () => {
    if (answer === null) return
    if (answer !== hint.action) { setResult('incorrect'); return }
    setResult('correct')
    const ids = [...new Set([...completed, ...readCompletedStarBattleLessons(), lesson.id])]
    setCompleted(ids); setSaveFailed(!storeCompletedStarBattleLessons(ids))
  }
  return <section className="lesson-page">
    <header className="lesson-heading">
      <p className="eyebrow">Star Battle · Exercise {lesson.exerciseNumber} of {technique.exercises.length} · {lesson.guidance === 'guided' ? 'Guided' : 'Practice'}{completed.includes(lesson.id) && ' · Completed'}</p>
      <Link to="/learn/star-battle" className="lesson-back" aria-label="All Star Battle techniques">← All techniques</Link>
      <h1 className="page-title" ref={heading} tabIndex={-1}>{technique.title}</h1>
    </header>
    <nav className="lesson-siblings" aria-label={`${technique.title} exercises`}>
      {technique.exercises.map(exercise => <Link key={exercise.id} className="tool-button" to={`/learn/star-battle/${exercise.id}`}
        aria-current={exercise.id === lesson.id ? 'page' : undefined}>Exercise {exercise.exerciseNumber}</Link>)}
    </nav>
    <div className="lesson-workspace">
      <div className="lesson-board">
        <InteractiveBoard board={board} game={game} locked conflictCells={noConflicts}
          hint={{ cell: hint.cell, support: showPattern ? hint.support : [] }} hintId="star-lesson-board-guide"
          onToggleQueen={noop} onToggleMark={noop} onClear={noop} onRequestHint={noop} onUndo={noop} onRedo={noop}
          onGestureStart={noop} onPaintCell={noop} onGestureEnd={noop} />
        <p id="star-lesson-board-guide" className="lesson-board-guide">Solid outline: target{showPattern ? ' · Dashed: groups and blocking stars' : ''}. Stars and crosses are prepared. Use arrow keys to inspect; the board cannot be edited.</p>
      </div>
      <section className="lesson-task" aria-labelledby="star-lesson-idea">
        <h2 id="star-lesson-idea">The idea</h2><p>{technique.introduction}</p>
        {showPattern ? <>
          <p className="lesson-cue">{lesson.cue}</p>
          <div className="lesson-evidence">
            {lesson.witness.homes.length > 0 && <p>Source groups need <strong>{lesson.sourceNeed}</strong> more stars. In {lesson.homeNames}, there is room for <strong>{lesson.homeNeed}</strong> more stars in total.</p>}
            <details><summary>Inspect the group counts and spaces</summary>
              {lesson.witness.sources.map(group => <p key={`source-${group.kind}-${group.index}`}>
                <strong>Source · {starLessonGroupName(board, group)}</strong><br />
                {group.need} more {group.need === 1 ? 'star' : 'stars'} needed · available {group.candidates.map(cell => hintCellName(board, cell)).join(', ')}.
              </p>)}
              {lesson.witness.homes.map(group => <p key={`home-${group.kind}-${group.index}`}>
                <strong>Home · {starLessonGroupName(board, group)}</strong> · room for {group.need} more {group.need === 1 ? 'star' : 'stars'}.
              </p>)}
            </details>
          </div>
        </> : <button type="button" className="tool-button" onClick={() => setClueRequested(true)}>Show a clue</button>}
        <fieldset disabled={explained}>
          <legend>What belongs in {hintCellName(board, hint.cell)}?</legend>
          <p>Choose a move for the outlined space, then check your answer.</p>
          <div className="lesson-responses">
            <button type="button" className="tool-button" aria-pressed={(explained ? hint.action : answer) === 'queen'}
              onClick={() => { setAnswer('queen'); setResult('idle') }}>Place a star</button>
            <button type="button" className="tool-button" aria-pressed={(explained ? hint.action : answer) === 'x'}
              onClick={() => { setAnswer('x'); setResult('idle') }}>Mark X</button>
          </div>
        </fieldset>
        <div className="lesson-actions">
          {!explained && <><button type="button" className="tool-button primary" disabled={answer === null} onClick={check}>Check answer</button>
            <button type="button" className="tool-button" onClick={() => setResult('revealed')}>Show explanation</button></>}
          {explained && <button type="button" className="tool-button" onClick={() => { setAnswer(null); setResult('idle'); setClueRequested(false) }}>Try again</button>}
        </div>
        <p className="lesson-feedback" role="status" aria-live="polite">
          {result === 'incorrect' && 'Not quite. Revisit the groups and try again, or open the explanation.'}
          {result === 'correct' && 'Lesson complete. This move follows from the available spaces and remaining stars.'}
          {result === 'revealed' && 'The move is shown on the board. Try again to practice this deduction.'}
        </p>
        {saveFailed && <p className="status">This browser could not save your completion. It is shown here until you leave this exercise.</p>}
        {explained && <section className="lesson-explanation" aria-labelledby="star-lesson-why">
          <h2 id="star-lesson-why">Why it works</h2><p>{lesson.explanation}</p>
          {next ? <Link className="tool-button primary" to={`/learn/star-battle/${next.id}`} aria-label="Next exercise">Next exercise →</Link>
            : <div className="lesson-actions"><Link className="tool-button primary" to="/learn/star-battle">All techniques →</Link>
              <Link className="tool-button" to="/star-battle">Try a full Star Battle →</Link></div>}
        </section>}
      </section>
    </div>
    <p className="lesson-note">Practice one deduction, rather than solve the full board. Completion saves separately in this browser.</p>
  </section>
}
