import { Link } from 'react-router-dom'
import { challengeProgress, type ChallengeGoal } from '../lib/challenges'
import type { SolveRecord } from '../lib/stats'

function Goals({ goals }: { readonly goals: readonly ChallengeGoal[] }) {
  return <ul>{goals.map(goal => <li key={goal.id}>
    <span className={goal.progress === goal.target ? 'challenge-check complete' : 'challenge-check'} aria-hidden="true">{goal.progress === goal.target ? '✓' : '○'}</span>
    <span>{goal.label}</span>
    <span className="challenge-count">{goal.progress} / {goal.target}{goal.progress === goal.target && <span className="sr-only"> complete</span>}</span>
  </li>)}</ul>
}

export function Challenges({ records, today, timeZone }: {
  readonly records: readonly SolveRecord[]; readonly today: string; readonly timeZone: string
}) {
  const { daily, weekly } = challengeProgress(records, today, timeZone)
  const weekLabel = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${weekly.weekStart}T00:00:00Z`))
  const dailyDone = daily.completed === daily.goals.length
  const weeklyDone = weekly.solves >= weekly.target
  return <div className="challenge-cards">
    <details className="challenge-card daily-challenge">
      <summary>
        <span className="challenge-title">Daily challenge</span>
        <span className={dailyDone ? 'challenge-summary complete' : 'challenge-summary'}>
          {dailyDone ? 'Complete!' : <>{daily.completed} / {daily.goals.length} goals<span className="sr-only"> complete</span></>}
        </span>
        <span className="challenge-chevron" aria-hidden="true">⌄</span>
      </summary>
      <div className="challenge-content">
        <Goals goals={daily.goals} />
        <p>First solves today count, including hints and older puzzles. Replays don&rsquo;t count. Optional; starts fresh at local midnight.</p>
        <Link to="/archive">Explore the archive <span aria-hidden="true">→</span></Link>
      </div>
    </details>
    <details className="challenge-card weekly-challenge">
      <summary>
        <span className="challenge-title">Weekly challenge</span>
        <span className={weeklyDone ? 'challenge-summary complete' : 'challenge-summary'}>
          {weeklyDone ? 'Complete!' : `${weekly.solves} / ${weekly.target} puzzles`}
        </span>
        <span className="challenge-chevron" aria-hidden="true">⌄</span>
      </summary>
      <div className="challenge-content">
        <p>Week of {weekLabel}</p>
        <Goals goals={weekly.goals} />
        <p>First solves this week count, including hints and older puzzles. Replays don&rsquo;t count. Optional; starts fresh each Monday.</p>
        <Link to="/archive">Explore the archive <span aria-hidden="true">→</span></Link>
      </div>
    </details>
  </div>
}
