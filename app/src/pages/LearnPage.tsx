import { useState } from 'react'
import { Link } from 'react-router-dom'
import { SUDOKU_LESSONS, SUDOKU_TECHNIQUES } from '../domain/sudokuLessons'
import { STAR_BATTLE_LESSONS, STAR_BATTLE_TECHNIQUES } from '../domain/starBattleLessons'
import { readCompletedLessons } from '../lib/lessonProgress'
import { readCompletedStarBattleLessons } from '../lib/starBattleLessonProgress'

export function LearnPage() {
  const [sudokuCompleted] = useState(readCompletedLessons)
  const [starCompleted] = useState(readCompletedStarBattleLessons)
  return <section className="learn-page">
    <h1 className="page-title">Learn to solve</h1>
    <p className="page-intro">Choose a game, then practice one deduction at a time.</p>
    <ul className="lesson-cards">
      <li><h2>Sudoku</h2>
        <p>{SUDOKU_TECHNIQUES.length} techniques · {SUDOKU_LESSONS.length} exercises. Start with locked candidates, then work through pairs, triples and X-wing.</p>
        <p className="lesson-progress">{sudokuCompleted.length} of {SUDOKU_LESSONS.length} completed</p>
        <Link className="tool-button primary" to="/learn/sudoku">Learn Sudoku →</Link></li>
      <li><h2>Star Battle</h2>
        <p>{STAR_BATTLE_TECHNIQUES.length} techniques · {STAR_BATTLE_LESSONS.length} exercises. Begin with the last space, then reserve spaces across groups.</p>
        <p className="lesson-progress">{starCompleted.length} of {STAR_BATTLE_LESSONS.length} completed</p>
        <Link className="tool-button primary" to="/learn/star-battle">Learn Star Battle →</Link></li>
    </ul>
    <p className="status">Completion saves in this browser, separately from daily stats, streaks and leaderboards.</p>
  </section>
}
