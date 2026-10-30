import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { InteractiveBoard } from '../components/InteractiveBoard'
import { TechniqueCelebration } from '../components/TechniqueProgress'
import { hintCellName } from '../domain/hints'
import { STAR_BATTLE_CHAINS } from '../domain/starBattleChains'
import { readCompletedStarBattleLessons, storeCompletedStarBattleLessons } from '../lib/starBattleLessonProgress'
import { finishesTechnique } from '../lib/learningAchievements'

const noop = () => {}
const noConflicts = new Set<number>()
type Lesson = typeof STAR_BATTLE_CHAINS[number]

export function StarBattleChainExercise({ lesson }: { lesson: Lesson }) {
  const [selected, setSelected] = useState<number | null>(null)
  const [result, setResult] = useState<'idle' | 'incorrect' | 'correct' | 'revealed'>('idle')
  const [clue, setClue] = useState(false)
  const [completed, setCompleted] = useState(readCompletedStarBattleLessons)
  const [saveFailed, setSaveFailed] = useState(false)
  const [newAchievement, setNewAchievement] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { window.scrollTo({ top: 0 }); heading.current?.focus({ preventScroll: true }) }, [])
  const explained = result === 'correct' || result === 'revealed'
  const target = selected !== null && lesson.answers.includes(selected) ? selected : lesson.answers[0]!
  const showPattern = lesson.guidance === 'guided' || clue || explained
  const game = explained ? { ...lesson.game, queens: new Set([...lesson.game.queens, target]), marks: new Set([...lesson.game.marks, lesson.first.cell]) } : lesson.game
  const next = STAR_BATTLE_CHAINS[lesson.exerciseNumber]
  const retry = () => { setSelected(null); setResult('idle'); setClue(false); window.scrollTo({ top: 0 }); heading.current?.focus({ preventScroll: true }) }
  const check = () => {
    if (selected === null) return
    if (!lesson.answers.includes(selected)) { setResult('incorrect'); return }
    setResult('correct')
    const before = readCompletedStarBattleLessons()
    const ids = [...new Set([...completed, ...before, lesson.id])]
    const saved = storeCompletedStarBattleLessons(ids)
    setCompleted(ids); setSaveFailed(!saved)
    setNewAchievement(saved && finishesTechnique(STAR_BATTLE_CHAINS, before, lesson.id))
  }
  return <section className="lesson-page">
    <header className="lesson-heading">
      <p className="eyebrow">Star Battle · Exercise {lesson.exerciseNumber} of {STAR_BATTLE_CHAINS.length} · {lesson.guidance === 'guided' ? 'Guided' : 'Practice'}{completed.includes(lesson.id) && ' · Completed'}</p>
      <Link to="/learn/star-battle" className="lesson-back" aria-label="All Star Battle techniques">← All techniques</Link>
      <h1 className="page-title" ref={heading} tabIndex={-1}>From reservation to stars</h1>
    </header>
    <nav className="lesson-siblings" aria-label="From reservation to stars exercises">
      {STAR_BATTLE_CHAINS.map(exercise => <Link key={exercise.id} className="tool-button" to={`/learn/star-battle/${exercise.id}`} aria-current={exercise.id === lesson.id ? 'page' : undefined}>Exercise {exercise.exerciseNumber}</Link>)}
    </nav>
    <p className="star-chain-mobile-prompt" aria-hidden="true">Find a star in {lesson.groupName}.</p>
    <div className="lesson-workspace">
      <div className="lesson-board">
        <InteractiveBoard board={lesson.board} game={game} locked conflictCells={noConflicts} hintId="star-chain-guide"
          hint={showPattern ? { cell: target, support: lesson.support.filter(cell => cell !== target) } : null}
          inspection={{ selected, onSelect: cell => { if (!explained) { setSelected(cell); setResult('idle') } } }}
          onToggleQueen={noop} onToggleMark={noop} onClear={noop} onRequestHint={noop} onUndo={noop} onRedo={noop}
          onGestureStart={noop} onPaintCell={noop} onGestureEnd={noop} />
        <p id="star-chain-guide" className="lesson-board-guide">Stars and crosses are prepared. Select a cell by touch, click or arrow keys. Blue outline: your selection.{showPattern && ' Green outline: example. Dashed outlines: supporting groups.'}</p>
      </div>
      <section className="lesson-task" aria-labelledby="star-chain-idea">
        <h2 id="star-chain-idea">The idea</h2>
        <p>A reservation can rule out a space in another group. Then count what is left: that exclusion may force stars somewhere else.</p>
        {showPattern ? <p className="lesson-cue">Follow the highlighted groups to the example at {hintCellName(lesson.board, target)}.</p>
          : <button type="button" className="tool-button" onClick={() => setClue(true)}>Show a clue</button>}
        <fieldset disabled={explained}>
          <legend>Find a star in {lesson.groupName}.</legend>
          <p>Select a space on the board, then check your answer.</p>
          <p>{selected === null ? 'Select a cell on the board to begin.' : `Selected ${hintCellName(lesson.board, selected)}.`}</p>
        </fieldset>
        <div className="lesson-actions">
          {!explained && <><button type="button" className="tool-button primary" disabled={selected === null} onClick={check}>Check answer</button>
            <button type="button" className="tool-button" onClick={() => setResult('revealed')}>Show explanation</button></>}
          {explained && <button type="button" className="tool-button" onClick={retry}>Try again</button>}
        </div>
        <p className="lesson-feedback" role="status" aria-live="polite">{result === 'incorrect' && 'Not quite. Use a reservation to narrow the line, then try again.'}{result === 'correct' && (lesson.answers.length === 1 ? 'Lesson complete. The remaining space must hold a star.' : 'Lesson complete. Both remaining spaces must hold stars.')}{result === 'correct' && newAchievement && <TechniqueCelebration title="From reservation to stars" />}{result === 'revealed' && 'Example shown. Try again to practice this deduction.'}</p>
        {saveFailed && <p className="status">This browser could not save your completion. It is shown here until you leave this exercise.</p>}
        {explained && <section className="lesson-explanation" aria-labelledby="star-chain-why"><h2 id="star-chain-why">Why it works</h2>
          <ol>{lesson.reasons.map(reason => <li key={reason}>{reason}</li>)}</ol>
          {next ? <Link className="tool-button primary" to={`/learn/star-battle/${next.id}`} aria-label="Next exercise">Next exercise →</Link>
            : <Link className="tool-button primary" to="/learn/star-battle">All techniques →</Link>}
        </section>}
      </section>
    </div>
    <p className="lesson-note">Practice one deduction. Completion saves separately from daily games.</p>
  </section>
}
