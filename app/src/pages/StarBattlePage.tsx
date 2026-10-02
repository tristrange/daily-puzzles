import { useState } from 'react'
import { puzzleIdFor, puzzleOfToday } from '../domain/dates'
import { PuzzleView } from '../components/PuzzleView'

/**
 * Today's Star Battle companion, as its own game rather than a variation of the
 * daily puzzle. The two are separate puzzles with separate solves, so this
 * resolves the day's `-star` id and plays that file.
 */
export function StarBattlePage() {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const [id] = useState(() => puzzleIdFor(puzzleOfToday(new Date(), timeZone), 'star-battle'))
  return (
    <section>
      <h2 className="page-title">Today&rsquo;s Star Battle</h2>
      <PuzzleView
        key={id}
        id={id}
        notFoundMessage="Today&rsquo;s Star Battle is not published yet. It goes out alongside the daily puzzle."
      />
    </section>
  )
}
