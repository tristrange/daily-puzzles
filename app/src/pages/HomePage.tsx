import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { PuzzleType } from '../domain/board'
import { formatPuzzleLabel, puzzleIdsForDay, puzzleOfToday, puzzleTypeOf } from '../domain/dates'
import { DEFAULT_PUZZLE_TYPE, DIFFICULTY_LABEL, PUZZLE_TYPE_LABEL, PUZZLE_PIECE } from '../domain/games'
import { probePuzzles, type ProbedPuzzle } from '../lib/puzzles'
import { trackVariantOf } from '../domain/trackSizes'
import { readStoredStats } from '../lib/stats'

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; probes: readonly ProbedPuzzle[] }

const DESCRIPTION: Record<PuzzleType, string> = {
  queens: 'One queen in each row, column and region. No touching.',
  'star-battle': 'Place stars to satisfy each row, column and region. Keep them apart.',
  'train-tracks': 'Connect the ends with one track. Match every row and column count.',
  'word-paths': 'Find words along adjoining letters. Use every letter once.',
  trio: 'Balance sun, moon and star. Three of each in every row and column.',
}

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
    // `probePuzzles` never rejects: each id fails alone, so there is no whole-page
    // failure left to handle here.
    probePuzzles(puzzleIdsForDay(todayId)).then((probes) => {
      if (!cancelled) setState({ status: 'ready', probes })
    })
    return () => {
      cancelled = true
    }
  }, [todayId])

  return (
    <section className="today">
      <div className="today-heading">
        <p className="eyebrow">{formatPuzzleLabel(todayId, timeZone)}</p>
        <h1 className="page-title">Today&rsquo;s puzzles</h1>
        <p className="page-intro">Fresh logic puzzles, every day. Pick your challenge.</p>
      </div>
      {state.status === 'loading' && <p className="status">Checking what&rsquo;s out…</p>}
      {state.status === 'ready' && (
        <TodayCards probes={state.probes} solved={solved} />
      )}
      <div className="today-more">
        <p>Another round?</p>
        <Link to="/archive">Explore the archive <span aria-hidden="true">→</span></Link>
        <Link to="/stats">Your progress <span aria-hidden="true">→</span></Link>
      </div>
    </section>
  )
}

/** Rendering is shared by the daily page and controlled publication-state tests. */
export function TodayCards({ probes, solved }: {
  readonly probes: readonly ProbedPuzzle[]
  readonly solved: ReadonlySet<string>
}) {
  const groups = new Map<PuzzleType, ProbedPuzzle[]>()
  for (const probe of probes) {
    const family = probe.puzzle?.puzzleType ?? familyOf(probe.id)
    const group = groups.get(family)
    if (group) group.push(probe)
    else groups.set(family, [probe])
  }
  return (
    <ul className="game-cards">
      {[...groups].map(([family, entries]) => {
        const probe = entries[0]!
        const sized = family === 'train-tracks' && trackVariantOf(probe.id) !== null
        return (
          <li key={family} className={`game-card game-${family}`}>
            <div className="game-motif" aria-hidden="true">
              <div className="motif-grid">
                {Array.from({ length: 9 }, (_, cell) => (
                  <span key={cell} className={cell === 4 ? 'motif-piece' : ''}>
                    {cell === 4 && PUZZLE_PIECE[family].glyph}
                  </span>
                ))}
              </div>
            </div>
            <h2 className="game-card-title">{PUZZLE_TYPE_LABEL[family]}</h2>
            <p className="game-card-description">{DESCRIPTION[family]}</p>
            {sized ? (
              <ul className="track-variants">
                {entries.map((entry) => {
                  const variant = trackVariantOf(entry.id)!
                  const label = `${variant.label} · ${variant.side}×${variant.side}`
                  const again = solved.has(entry.id)
                  return (
                    <li key={entry.id}>
                      {entry.puzzle === null ? (
                        <div className="track-unpublished">
                          <span>{label}</span><span className="game-card-state">{entry.unavailable ? 'Not saved — connect to load.' : 'Not published yet.'}</span>
                        </div>
                      ) : (
                        <Link className="tool-button track-choice" to={`/archive/${entry.id}`}
                          aria-label={`Play Train Tracks ${variant.label}${again ? ' again' : ''}`}>
                          <span>{label}</span>
                          <span className={again ? 'solved' : ''}>{again ? 'Solved' : 'Play'} <span aria-hidden="true">↗</span></span>
                        </Link>
                      )}
                    </li>
                  )
                })}
              </ul>
            ) : (
              <>
                <p className="game-card-detail">
                  {probe.puzzle !== null && <>{probe.puzzle.board.width}&times;{probe.puzzle.board.height} grid</>}
                  {probe.puzzle?.difficulty != null && <> · {DIFFICULTY_LABEL[probe.puzzle.difficulty]}</>}
                </p>
                {probe.puzzle === null ? <p className="game-card-state">{probe.unavailable ? 'Not saved — connect to load.' : 'Not published yet.'}</p> : (
                  <>
                    {solved.has(probe.id) && <p className="game-card-state solved">Solved today.</p>}
                    <Link className="tool-button primary" to={`/archive/${probe.id}`}
                      aria-label={`Play ${PUZZLE_TYPE_LABEL[family]}${solved.has(probe.id) ? ' again' : ''}`}>
                      {solved.has(probe.id) ? 'Play again' : 'Play'} <span aria-hidden="true">↗</span>
                    </Link>
                  </>
                )}
              </>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * The family to show before a puzzle has loaded. Read from the id's registered
 * suffix rather than guessed: the publisher only ever writes a family into its own
 * slot, so this holds even when the file is missing. Falling back to the default
 * family is the only thing left to guess, and only for an id no family claims.
 */
function familyOf(id: string): PuzzleType {
  return puzzleTypeOf(id) ?? DEFAULT_PUZZLE_TYPE
}
