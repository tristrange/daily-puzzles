import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatPuzzleLabel, isStarPuzzleId, puzzleIdsForDay, puzzleOfToday } from '../domain/dates'
import { PUZZLE_TYPE_LABEL } from '../domain/games'
import { probePuzzles, type ProbedPuzzle } from '../lib/puzzles'
import { readStoredStats } from '../lib/stats'

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; probes: readonly ProbedPuzzle[] }

/**
 * The landing page: a choice between today's puzzles rather than today's puzzle.
 *
 * Every day carries a Queens board and a Star Battle companion, so the first
 * question on arrival is which one to play, and the site has no business
 * answering that on the player's behalf. Both are linked straight to the board,
 * so choosing costs one click rather than a detour through a menu.
 *
 * "Today" is not assumed to be complete. A day can have its Queens board out
 * and no companion yet, and an absent file is reported as such on its own card
 * instead of failing the page.
 */
export function HomePage() {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const [todayId] = useState(() => puzzleOfToday(new Date(), timeZone))
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  // Read once, like the archive does: history is not going to change while the
  // page is open, and the cards only use it to say what has been solved today.
  const [solved] = useState(() => new Set(readStoredStats().map((record) => record.id)))

  useEffect(() => {
    let cancelled = false
    probePuzzles(puzzleIdsForDay(todayId)).then(
      (probes) => {
        if (!cancelled) setState({ status: 'ready', probes })
      },
      () => {
        // Nothing loaded means nothing can be offered; say so rather than spin.
        if (!cancelled) setState({ status: 'ready', probes: puzzleIdsForDay(todayId).map((id) => ({ id, puzzle: null })) })
      },
    )
    return () => {
      cancelled = true
    }
  }, [todayId])

  return (
    <section>
      <h2 className="page-title">Today&rsquo;s puzzles</h2>
      <p className="status">A new puzzle of each game every day. Pick one to play.</p>
      {state.status === 'loading' && <p className="status">Checking what&rsquo;s out…</p>}
      {state.status === 'ready' && (
        <ul className="game-cards">
          {state.probes.map((probe) => {
            const family = probe.puzzle?.puzzleType ?? familyOf(probe.id)
            return (
            <li key={probe.id} className="game-card">
              <h3 className="game-card-title">{PUZZLE_TYPE_LABEL[family]}</h3>
              <p className="game-card-detail">
                {formatPuzzleLabel(probe.id, timeZone)}
                {probe.puzzle !== null && (
                  <> · {probe.puzzle.size}&times;{probe.puzzle.size}</>
                )}
              </p>
              {probe.puzzle === null ? (
                <p className="game-card-detail">Not published yet.</p>
              ) : solved.has(probe.id) ? (
                <>
                  <p className="game-card-detail">Solved today.</p>
                  <Link className="tool-button" to={`/archive/${probe.id}`}>
                    Play again
                  </Link>
                </>
              ) : (
                <Link className="tool-button" to={`/archive/${probe.id}`}>
                  Play
                </Link>
              )}
            </li>
            )
          })}
        </ul>
      )}
      <p className="status">
        Every day so far is in the <Link to="/archive">archive</Link>, and your solves are
        counted on the <Link to="/stats">stats</Link> page.
      </p>
    </section>
  )
}

/**
 * The family to show before a puzzle has loaded. Derived from the id's suffix
 * rather than guessed: the publisher only ever writes a companion into the
 * `-star` slot, so this holds even when the file is missing.
 */
function familyOf(id: string): 'queens' | 'star-battle' {
  return isStarPuzzleId(id) ? 'star-battle' : 'queens'
}
