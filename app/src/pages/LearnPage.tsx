import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { SUDOKU_LESSONS, SUDOKU_TECHNIQUES } from '../domain/sudokuLessons'
import { STAR_BATTLE_LESSONS, STAR_BATTLE_TECHNIQUES } from '../domain/starBattleLessons'
import { STAR_BATTLE_CHAINS } from '../domain/starBattleChains'
import { TRIO_LESSONS, TRIO_TECHNIQUES } from '../domain/trioLessons'
import { readCompletedTrioLessons } from '../lib/trioLessonProgress'
import { readCompletedLessons } from '../lib/lessonProgress'
import { readCompletedStarBattleLessons } from '../lib/starBattleLessonProgress'
import { readGridLessons } from '../lib/gridLessonProgress'
import { GRID_LESSONS, GRID_TECHNIQUES, type GridLesson } from '../domain/gridLessons'
import { QUEENS_LESSONS, QUEENS_TECHNIQUES } from '../domain/queensLessons'
import { readQueensLessons } from '../lib/queensLessonProgress'
import { KILLER_LESSONS } from '../domain/killerLessons'
import { KILLER_FORTY_FIVE_LESSONS } from '../domain/killerFortyFiveLessons'
import { readKillerLessons } from '../lib/killerLessonProgress'
import { techniqueProgress } from '../lib/learningAchievements'

function readLearningProgress() {
  return {
    trio: readCompletedTrioLessons(), sudoku: readCompletedLessons(), killer: readKillerLessons(),
    star: readCompletedStarBattleLessons(), nurikabe: readGridLessons('nurikabe'),
    tents: readGridLessons('tents'), tracks: readGridLessons('train-tracks'), queens: readQueensLessons(),
  }
}

function countPracticed(groups: readonly (readonly { id: string }[])[], completed: readonly string[]) {
  return { practiced: groups.filter(group => techniqueProgress(group, completed).practiced).length, total: groups.length }
}

function gridGroups(kind: GridLesson['kind']) {
  return GRID_TECHNIQUES[kind].map(technique => GRID_LESSONS.filter(lesson => lesson.kind === kind && lesson.technique === technique.id))
}

export function LearnPage() {
  const [completed, setCompleted] = useState(readLearningProgress)
  useEffect(() => {
    const refresh = () => setCompleted(readLearningProgress())
    const onVisibility = () => { if (!document.hidden) refresh() }
    window.addEventListener('focus', refresh)
    window.addEventListener('pageshow', refresh)
    window.addEventListener('storage', refresh)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('focus', refresh)
      window.removeEventListener('pageshow', refresh)
      window.removeEventListener('storage', refresh)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])
  const counts = {
    queens: countPracticed(QUEENS_TECHNIQUES.map(technique => QUEENS_LESSONS.filter(lesson => lesson.technique === technique.id)), completed.queens),
    sudoku: countPracticed(SUDOKU_TECHNIQUES.map(technique => technique.exercises), completed.sudoku),
    killer: countPracticed([KILLER_LESSONS, KILLER_FORTY_FIVE_LESSONS], completed.killer),
    star: countPracticed([...STAR_BATTLE_TECHNIQUES.map(technique => technique.exercises), STAR_BATTLE_CHAINS], completed.star),
    trio: countPracticed(TRIO_TECHNIQUES.map(technique => technique.exercises), completed.trio),
    nurikabe: countPracticed(gridGroups('nurikabe'), completed.nurikabe),
    tents: countPracticed(gridGroups('tents'), completed.tents),
    tracks: countPracticed(gridGroups('train-tracks'), completed.tracks),
  }
  const practiced = Object.values(counts).reduce((sum, count) => sum + count.practiced, 0)
  const total = Object.values(counts).reduce((sum, count) => sum + count.total, 0)
  return <section className="learn-page">
    <h1 className="page-title">Learn to solve</h1>
    <p className="page-intro">Choose a game, then practice one deduction at a time.</p>
    <div className="learning-overview">
      <strong>Learning achievements</strong>
      <span>{practiced} of {total} techniques practiced</span>
      <p>Complete every exercise in a technique to earn it.</p>
    </div>
    <ul className="lesson-cards">
      <li><h2>Queens</h2><p>Combine region reservations, lines and the no-touch rule.</p>
        <p className="lesson-progress">{completed.queens.length} of {QUEENS_LESSONS.length} completed<br />{counts.queens.practiced} of {counts.queens.total} techniques practiced</p>
        <Link className="tool-button primary" to="/learn/queens">Learn Queens →</Link></li>
      <li><h2>Sudoku</h2>
        <p>{SUDOKU_TECHNIQUES.length} techniques · {SUDOKU_LESSONS.length} exercises. Start with locked candidates, then work through pairs, triples, X-Wing and beyond.</p>
        <p className="lesson-progress">{completed.sudoku.length} of {SUDOKU_LESSONS.length} completed<br />{counts.sudoku.practiced} of {counts.sudoku.total} techniques practiced</p>
        <Link className="tool-button primary" to="/learn/sudoku">Learn Sudoku →</Link></li>
      <li><h2>Killer Sudoku</h2><p>Use cage combinations and the 45 rule to narrow down possibilities.</p>
        <p className="lesson-progress">{completed.killer.length} of {KILLER_LESSONS.length + KILLER_FORTY_FIVE_LESSONS.length} completed<br />{counts.killer.practiced} of {counts.killer.total} techniques practiced</p>
        <Link className="tool-button primary" to="/learn/killer-sudoku">Learn Killer Sudoku →</Link></li>
      <li><h2>Star Battle</h2>
        <p>{STAR_BATTLE_TECHNIQUES.length + 1} techniques · {STAR_BATTLE_LESSONS.length + STAR_BATTLE_CHAINS.length} exercises. Begin with counting spaces, then combine reservations with other deductions.</p>
        <p className="lesson-progress">{completed.star.length} of {STAR_BATTLE_LESSONS.length + STAR_BATTLE_CHAINS.length} completed<br />{counts.star.practiced} of {counts.star.total} techniques practiced</p>
        <Link className="tool-button primary" to="/learn/star-battle">Learn Star Battle →</Link></li>
      <li><h2>Trio</h2>
        <p>{TRIO_TECHNIQUES.length} techniques · {TRIO_LESSONS.length} exercises. Combine quotas and no-three, propagate linked restrictions, then follow candidate chains.</p>
        <p className="lesson-progress">{completed.trio.length} of {TRIO_LESSONS.length} completed<br />{counts.trio.practiced} of {counts.trio.total} techniques practiced</p>
        <Link className="tool-button primary" to="/learn/trio">Learn Trio →</Link></li>
      <li><h2>Nurikabe</h2><p>Connect the sea, compare island shapes and find routes to isolated land.</p>
        <p className="lesson-progress">{completed.nurikabe.length} of {GRID_LESSONS.filter(lesson => lesson.kind === 'nurikabe').length} completed<br />{counts.nurikabe.practiced} of {counts.nurikabe.total} techniques practiced</p>
        <Link className="tool-button primary" to="/learn/nurikabe">Learn Nurikabe →</Link></li>
      <li><h2>Tents</h2><p>Compare tree pairings, line counts and possible arrangements.</p>
        <p className="lesson-progress">{completed.tents.length} of {GRID_LESSONS.filter(lesson => lesson.kind === 'tents').length} completed<br />{counts.tents.practiced} of {counts.tents.total} techniques practiced</p>
        <Link className="tool-button primary" to="/learn/tents">Learn Tents →</Link></li>
      <li><h2>Train Tracks</h2><p>Connect separated track, combine line counts and avoid closing loops.</p>
        <p className="lesson-progress">{completed.tracks.length} of {GRID_LESSONS.filter(lesson => lesson.kind === 'train-tracks').length} completed<br />{counts.tracks.practiced} of {counts.tracks.total} techniques practiced</p>
        <Link className="tool-button primary" to="/learn/train-tracks">Learn Train Tracks →</Link></li>
    </ul>
    <p className="status">Learning progress and achievements stay in this browser and are not included in Stats backups.</p>
  </section>
}
