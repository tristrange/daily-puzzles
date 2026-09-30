import { useState } from 'react'
import { puzzleOfToday } from '../domain/dates'
import { PuzzleView } from '../components/PuzzleView'

export function DailyPage() {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const [id] = useState(() => puzzleOfToday(new Date(), timeZone))
  return (
    <section>
      <h2 className="page-title">Today&rsquo;s puzzle</h2>
      <PuzzleView key={id} id={id} />
    </section>
  )
}