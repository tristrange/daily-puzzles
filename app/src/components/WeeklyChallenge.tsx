import { Link } from 'react-router-dom'
import { weeklyChallenge } from '../lib/weeklyChallenge'
import type { SolveRecord } from '../lib/stats'

export function WeeklyChallenge({ records, today, timeZone }: {
  records: readonly SolveRecord[]
  today: string
  timeZone: string
}) {
  const { weekStart, goals, completed } = weeklyChallenge(records, today, timeZone)
  const weekLabel = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${weekStart}T00:00:00Z`))
  return <details className="weekly-challenge">
    <summary>
      <span className="weekly-title">Weekly challenge <span>· Week of {weekLabel}</span></span>
      <span className={completed === goals.length ? 'weekly-summary complete' : 'weekly-summary'}>
        {completed === goals.length ? `All ${goals.length} goals complete!` : `${completed} of ${goals.length} goals complete`}
      </span>
      <span className="weekly-chevron" aria-hidden="true">⌄</span>
    </summary>
    <div className="weekly-content">
      <ul>
        {goals.map(goal => <li key={goal.id}>
          <span className={goal.progress === goal.target ? 'weekly-check complete' : 'weekly-check'} aria-hidden="true">{goal.progress === goal.target ? '✓' : '○'}</span>
          <span>{goal.label}</span>
          <span className="weekly-count">{goal.progress} / {goal.target}{goal.progress === goal.target && <span className="sr-only"> complete</span>}</span>
        </li>)}
      </ul>
      <p>First solves this week count, including hints and older puzzles. Replays don&rsquo;t count. Optional; starts fresh each Monday.</p>
      <Link to="/archive">Explore the archive <span aria-hidden="true">→</span></Link>
    </div>
  </details>
}
