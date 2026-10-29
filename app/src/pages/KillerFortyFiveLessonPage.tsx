import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { KillerCombinations } from '../components/KillerCombinations'
import { SudokuBoard } from '../components/SudokuBoard'
import { KILLER_FORTY_FIVE_LESSONS, fortyFiveExcluded, fortyFiveFacts, type KillerFortyFiveLesson } from '../domain/killerFortyFiveLessons'
import { createSudokuGame } from '../domain/sudoku'
import { completeKillerLesson, readKillerLessons } from '../lib/killerLessonProgress'

export function KillerFortyFiveLessonPage({ lesson, index }: { lesson: KillerFortyFiveLesson; index: number }) {
  const facts = fortyFiveFacts(lesson), target = facts.targetCells[0]!
  const [focused, setFocused] = useState(target)
  const [crossed, setCrossed] = useState<readonly number[]>([])
  const [result, setResult] = useState<'idle' | 'incorrect' | 'correct' | 'revealed'>('idle')
  const [clue, setClue] = useState(false), [completed, setCompleted] = useState(readKillerLessons), [saveFailed, setSaveFailed] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => { window.scrollTo({ top: 0 }); heading.current?.focus({ preventScroll: true }) }, [])
  const explained = result === 'correct' || result === 'revealed', showPattern = index === 0 || clue || explained
  const expected = fortyFiveExcluded(lesson), game = createSudokuGame(lesson.board)
  const hint = showPattern ? { cell: target, candidates: 0, source: game, reasons: [],
    support: facts.unitCells.filter(cell => !facts.targetCells.includes(cell)) } : null
  const check = () => {
    if (crossed.length !== expected.length || !expected.every(mask => crossed.includes(mask))) { setResult('incorrect'); return }
    setResult('correct'); setSaveFailed(!completeKillerLesson(lesson.id)); setCompleted([...new Set([...completed, lesson.id])])
  }
  return <section className="lesson-page">
    <header className="lesson-heading"><p className="eyebrow">Killer Sudoku · Exercise {index + 1} of {KILLER_FORTY_FIVE_LESSONS.length} · {index === 0 ? 'Guided' : 'Practice'}{completed.includes(lesson.id) && ' · Completed'}</p>
      <Link to="/learn/killer-sudoku" className="lesson-back">← All techniques</Link>
      <h1 className="page-title" ref={heading} tabIndex={-1}>The 45 rule</h1></header>
    <nav className="lesson-siblings" aria-label="45 rule exercises">{KILLER_FORTY_FIVE_LESSONS.map((item, i) => <Link key={item.id} className="tool-button" to={`/learn/killer-sudoku/${item.id}`} aria-current={i === index ? 'page' : undefined}>Exercise {i + 1}</Link>)}</nav>
    <p className="lesson-board-guide">{lesson.prompt}</p>
    <div className="lesson-workspace"><div className="lesson-board">
      <SudokuBoard board={lesson.board} game={game} selected={focused} selection={showPattern ? facts.targetCells : []} locked conflicts={new Set()} hint={hint} cageActive={showPattern} cageFocus={target} instructionsId="killer-forty-five-guide" onSelect={setFocused} />
      <p id="killer-forty-five-guide" className="lesson-board-guide">{showPattern
        ? `The shaded cage crosses the outlined ${lesson.unit.kind}. The selected cells are the ${lesson.side === 'innie' ? 'innies inside' : 'outies outside'} it.`
        : 'Find the crossing cage and use the row, column or box named in the task. Show a clue if you would like highlights.'}</p>
    </div><section className="lesson-task">
      <h2>The idea</h2><p>A row, column or box contains 1–9 once, so its digits add to 45.</p>
      <p>Cross out combinations that cannot make the subtotal. Leave other deductions for later.</p>
      {showPattern ? <p className="lesson-cue">{lesson.cue}</p> : <button type="button" className="tool-button" onClick={() => setClue(true)}>Show a clue</button>}
      <KillerCombinations cage={facts.cage} excluded={explained ? expected : crossed} disabled={explained} onToggle={mask => { setCrossed(crossed.includes(mask) ? crossed.filter(item => item !== mask) : [...crossed, mask]); setResult('idle') }} onReset={() => { setCrossed([]); setResult('idle') }} />
      <div className="lesson-actions">{!explained ? <><button type="button" className="tool-button primary" onClick={check}>Check answer</button><button type="button" className="tool-button" onClick={() => setResult('revealed')}>Show explanation</button></>
        : <button type="button" className="tool-button" onClick={() => { setCrossed([]); setResult('idle'); setClue(false) }}>Try again</button>}</div>
      <p className="lesson-feedback" role="status" aria-live="polite">{result === 'incorrect' ? 'Not quite. Check the subtotal and try again.' : result === 'correct' ? 'Lesson complete.' : result === 'revealed' ? 'Example shown. Try again to practice.' : ''}</p>
      {saveFailed && <p className="status">This browser could not save your completion.</p>}
      {explained && <section className="lesson-explanation"><h2>Why it works</h2><p>{lesson.explanation}</p>
        {KILLER_FORTY_FIVE_LESSONS[index + 1] ? <Link className="tool-button primary" aria-label="Next exercise" to={`/learn/killer-sudoku/${KILLER_FORTY_FIVE_LESSONS[index + 1]!.id}`}>Next exercise →</Link> : <Link className="tool-button primary" to="/learn/killer-sudoku">All techniques →</Link>}</section>}
    </section></div>
    <p className="lesson-note">Practice one deduction. Completion saves separately from your puzzles.</p>
  </section>
}
