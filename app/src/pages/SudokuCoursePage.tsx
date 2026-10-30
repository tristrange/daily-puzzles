import { useState } from 'react'
import { Link } from 'react-router-dom'
import { SUDOKU_LESSONS, SUDOKU_TECHNIQUES } from '../domain/sudokuLessons'
import { readCompletedLessons } from '../lib/lessonProgress'
import { TechniqueProgress } from '../components/TechniqueProgress'

export function SudokuCoursePage() {
  const [completed] = useState(readCompletedLessons)
  return <section className="learn-page">
    <Link to="/learn" className="lesson-back">← All games</Link>
    <h1 className="page-title">Sudoku techniques</h1>
    <p className="page-intro">Practice Sudoku deductions with {SUDOKU_LESSONS.length} short exercises across {SUDOKU_TECHNIQUES.length} techniques.</p>
    <p className="status">Work through the techniques in order, from locked candidates through XY-Wing and Swordfish.</p>
    <p className="status">{completed.length} of {SUDOKU_LESSONS.length} completed · Saved in this browser.</p>
    <ol className="lesson-cards">
      {SUDOKU_TECHNIQUES.map((technique, index) => <li key={technique.id}>
        <p className="eyebrow">Sudoku · Technique {index + 1} · {technique.level === 'medium' ? 'Medium techniques' : 'Hard techniques'}</p>
        <h2>{technique.title}</h2><p>{technique.introduction}</p>
        <TechniqueProgress exercises={technique.exercises} completed={completed} />
        <div className="lesson-exercise-links">
          {technique.exercises.map(exercise => <Link key={exercise.id} className="tool-button" to={`/learn/sudoku/${exercise.id}`}>
            <span>Exercise {exercise.exerciseNumber} · {exercise.guidance === 'guided' ? 'Guided' : 'Practice'}</span>
            <span className={completed.includes(exercise.id) ? 'lesson-completed' : undefined}>{completed.includes(exercise.id) ? 'Completed' : '→'}</span>
          </Link>)}
        </div>
      </li>)}
    </ol>
    <p className="status">Notes are prepared for each exercise. Lesson completion is separate from daily stats, streaks and leaderboards.</p>
  </section>
}
