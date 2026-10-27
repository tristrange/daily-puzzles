import { useState } from 'react'
import { Link } from 'react-router-dom'
import { STAR_BATTLE_LESSONS, STAR_BATTLE_TECHNIQUES } from '../domain/starBattleLessons'
import { STAR_BATTLE_CHAINS } from '../domain/starBattleChains'
import { readCompletedStarBattleLessons } from '../lib/starBattleLessonProgress'

export function StarBattleCoursePage() {
  const [completed] = useState(readCompletedStarBattleLessons)
  return <section className="learn-page">
    <Link to="/learn" className="lesson-back">← All games</Link>
    <h1 className="page-title">Star Battle techniques</h1>
    <p className="page-intro">Place two stars in every row, column and colored region. Stars cannot touch, even diagonally. An X rules out a space.</p>
    <p className="status">Start with counting spaces, then combine deductions across groups.</p>
    <p className="status">{completed.length} of {STAR_BATTLE_LESSONS.length + STAR_BATTLE_CHAINS.length} completed · Saved in this browser.</p>
    <ol className="lesson-cards">
      {STAR_BATTLE_TECHNIQUES.map((technique, index) => <li key={technique.id}>
        <p className="eyebrow">Technique {index + 1} · {technique.stage}</p>
        <h2>{technique.title}</h2><p>{technique.introduction}</p>
        <p className="lesson-progress">{technique.exercises.filter(exercise => completed.includes(exercise.id)).length} of {technique.exercises.length} completed</p>
        <div className="lesson-exercise-links">
          {technique.exercises.map(exercise => <Link key={exercise.id} className="tool-button" to={`/learn/star-battle/${exercise.id}`}>
            <span>Exercise {exercise.exerciseNumber} · {exercise.guidance === 'guided' ? 'Guided' : 'Practice'}</span>
            <span className={completed.includes(exercise.id) ? 'lesson-completed' : undefined}>{completed.includes(exercise.id) ? 'Completed' : '→'}</span>
          </Link>)}
        </div>
      </li>)}
      <li>
        <p className="eyebrow">Technique 5 · Combine deductions</p>
        <h2>From reservation to stars</h2><p>Use a reservation to remove a space, then count the remaining spaces in a line.</p>
        <p className="lesson-progress">{STAR_BATTLE_CHAINS.filter(exercise => completed.includes(exercise.id)).length} of {STAR_BATTLE_CHAINS.length} completed</p>
        <div className="lesson-exercise-links">
          {STAR_BATTLE_CHAINS.map(exercise => <Link key={exercise.id} className="tool-button" to={`/learn/star-battle/${exercise.id}`}>
            <span>Exercise {exercise.exerciseNumber} · {exercise.guidance === 'guided' ? 'Guided' : 'Practice'}</span>
            <span className={completed.includes(exercise.id) ? 'lesson-completed' : undefined}>{completed.includes(exercise.id) ? 'Completed' : '→'}</span>
          </Link>)}
        </div>
      </li>
    </ol>
    <p className="status">Stars and crosses are prepared for each exercise. Practice one deduction without affecting your daily games.</p>
  </section>
}
