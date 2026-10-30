import { useState } from 'react'
import { Link } from 'react-router-dom'
import { TRIO_LESSONS, TRIO_TECHNIQUES } from '../domain/trioLessons'
import { readCompletedTrioLessons } from '../lib/trioLessonProgress'
import { TechniqueProgress } from '../components/TechniqueProgress'

export function TrioCoursePage() {
  const [completed] = useState(readCompletedTrioLessons)
  return <section className="learn-page">
    <Link to="/learn" className="lesson-back">← All games</Link>
    <h1 className="page-title">Trio techniques</h1>
    <p className="page-intro">Every row and column needs three Suns, three Moons and three Stars. Three identical symbols cannot run together. Linked cells must match (=) or differ (×).</p>
    <p className="status">Combine quotas and no-three, carry deductions across links, then follow candidate chains.</p>
    <p className="status">{completed.length} of {TRIO_LESSONS.length} completed · Saved in this browser.</p>
    <ol className="lesson-cards">
      {TRIO_TECHNIQUES.map((technique, index) => <li key={technique.id}>
        <p className="eyebrow">Technique {index + 1} · {technique.stage}</p>
        <h2>{technique.title}</h2><p>{technique.introduction}</p>
        <TechniqueProgress exercises={technique.exercises} completed={completed} />
        <div className="lesson-exercise-links">
          {technique.exercises.map(exercise => <Link key={exercise.id} className="tool-button" to={`/learn/trio/${exercise.id}`}>
            <span>Exercise {exercise.exerciseNumber} · {exercise.guidance === 'guided' ? 'Guided' : 'Practice'}</span>
            <span className={completed.includes(exercise.id) ? 'lesson-completed' : undefined}>{completed.includes(exercise.id) ? 'Completed' : '→'}</span>
          </Link>)}
        </div>
      </li>)}
    </ol>
    <p className="status">Symbols and candidate notes are prepared. Find one exclusion in a named row or column. Each technique has a guided example and three practices.</p>
  </section>
}
