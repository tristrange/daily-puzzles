import { useState } from 'react'
import { Link } from 'react-router-dom'
import { SUDOKU_LESSONS, SUDOKU_TECHNIQUES } from '../domain/sudokuLessons'
import { STAR_BATTLE_LESSONS, STAR_BATTLE_TECHNIQUES } from '../domain/starBattleLessons'
import { STAR_BATTLE_CHAINS } from '../domain/starBattleChains'
import { TRIO_LESSONS, TRIO_TECHNIQUES } from '../domain/trioLessons'
import { readCompletedTrioLessons } from '../lib/trioLessonProgress'
import { readCompletedLessons } from '../lib/lessonProgress'
import { readCompletedStarBattleLessons } from '../lib/starBattleLessonProgress'
import { readGridLessons } from '../lib/gridLessonProgress'
import { GRID_LESSONS } from '../domain/gridLessons'
import { QUEENS_LESSONS } from '../domain/queensLessons'
import { readQueensLessons } from '../lib/queensLessonProgress'
import { KILLER_LESSONS } from '../domain/killerLessons'
import { readKillerLessons } from '../lib/killerLessonProgress'

export function LearnPage() {
  const [trioCompleted] = useState(readCompletedTrioLessons)
  const [sudokuCompleted] = useState(readCompletedLessons)
  const [killerCompleted] = useState(readKillerLessons)
  const [starCompleted] = useState(readCompletedStarBattleLessons)
  const [nurikabeCompleted] = useState(() => readGridLessons('nurikabe'))
  const [tentsCompleted] = useState(() => readGridLessons('tents'))
  const [tracksCompleted] = useState(() => readGridLessons('train-tracks'))
  const [queensCompleted] = useState(readQueensLessons)
  return <section className="learn-page">
    <h1 className="page-title">Learn to solve</h1>
    <p className="page-intro">Choose a game, then practice one deduction at a time.</p>
    <ul className="lesson-cards">
      <li><h2>Queens</h2><p>Combine region reservations, lines and the no-touch rule.</p>
        <p className="lesson-progress">{queensCompleted.length} of {QUEENS_LESSONS.length} completed</p>
        <Link className="tool-button primary" to="/learn/queens">Learn Queens →</Link></li>
      <li><h2>Sudoku</h2>
        <p>{SUDOKU_TECHNIQUES.length} techniques · {SUDOKU_LESSONS.length} exercises. Start with locked candidates, then work through pairs, triples, X-Wing and beyond.</p>
        <p className="lesson-progress">{sudokuCompleted.length} of {SUDOKU_LESSONS.length} completed</p>
        <Link className="tool-button primary" to="/learn/sudoku">Learn Sudoku →</Link></li>
      <li><h2>Killer Sudoku</h2><p>Use cage combinations and placed digits to rule out possibilities.</p>
        <p className="lesson-progress">{killerCompleted.length} of {KILLER_LESSONS.length} completed</p>
        <Link className="tool-button primary" to="/learn/killer-sudoku">Learn Killer Sudoku →</Link></li>
      <li><h2>Star Battle</h2>
        <p>{STAR_BATTLE_TECHNIQUES.length + 1} techniques · {STAR_BATTLE_LESSONS.length + STAR_BATTLE_CHAINS.length} exercises. Begin with counting spaces, then combine reservations with other deductions.</p>
        <p className="lesson-progress">{starCompleted.length} of {STAR_BATTLE_LESSONS.length + STAR_BATTLE_CHAINS.length} completed</p>
        <Link className="tool-button primary" to="/learn/star-battle">Learn Star Battle →</Link></li>
      <li><h2>Trio</h2>
        <p>{TRIO_TECHNIQUES.length} techniques · {TRIO_LESSONS.length} exercises. Combine quotas and no-three, propagate linked restrictions, then follow candidate chains.</p>
        <p className="lesson-progress">{trioCompleted.length} of {TRIO_LESSONS.length} completed</p>
        <Link className="tool-button primary" to="/learn/trio">Learn Trio →</Link></li>
      <li><h2>Nurikabe</h2><p>Connect the sea, compare island shapes and find routes to isolated land.</p>
        <p className="lesson-progress">{nurikabeCompleted.length} of {GRID_LESSONS.filter(lesson => lesson.kind === 'nurikabe').length} completed</p>
        <Link className="tool-button primary" to="/learn/nurikabe">Learn Nurikabe →</Link></li>
      <li><h2>Tents</h2><p>Compare tree pairings, line counts and possible arrangements.</p>
        <p className="lesson-progress">{tentsCompleted.length} of {GRID_LESSONS.filter(lesson => lesson.kind === 'tents').length} completed</p>
        <Link className="tool-button primary" to="/learn/tents">Learn Tents →</Link></li>
      <li><h2>Train Tracks</h2><p>Connect separated track, combine line counts and avoid closing loops.</p>
        <p className="lesson-progress">{tracksCompleted.length} of {GRID_LESSONS.filter(lesson => lesson.kind === 'train-tracks').length} completed</p>
        <Link className="tool-button primary" to="/learn/train-tracks">Learn Train Tracks →</Link></li>
    </ul>
    <p className="status">Completion saves in this browser, separately from daily stats, streaks and leaderboards.</p>
  </section>
}
