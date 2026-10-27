import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { PuzzleType } from '../domain/board'
import { formatPuzzleLabel, puzzleIdsForDay, puzzleTypeOf } from '../domain/dates'
import { DEFAULT_PUZZLE_TYPE, DIFFICULTY_LABEL, PUZZLE_TYPE_LABEL, PUZZLE_PIECE } from '../domain/games'
import { probePuzzles, type ProbedPuzzle } from '../lib/puzzles'
import { sudokuVariantOf, killerVariantOf } from '../domain/sudokuLevels'
import { trackVariantOf } from '../domain/trackSizes'
import { formatTime } from '../domain/game'
import { isMarksPuzzle, isTracksPuzzle, isTrioPuzzle, isTentsPuzzle, isSudokuPuzzle, isNurikabePuzzle, type Puzzle } from '../domain/puzzle'
import { WordGrid } from '../domain/wordPaths'
import { readStoredStats } from '../lib/stats'
import { useToday } from '../lib/useToday'

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; day: string; probes: readonly TodayPuzzle[] }

type TodayPuzzle = ProbedPuzzle & { readonly elapsedMs?: number | null }

const DESCRIPTION: Record<PuzzleType, string> = {
  queens: 'One queen in each row, column and region. No touching.',
  'star-battle': 'Place stars to satisfy each row, column and region. Keep them apart.',
  'train-tracks': 'Connect the ends with one track. Match every row and column count.',
  'word-paths': 'Find words along adjoining letters. Use every letter once.',
  trio: 'Balance sun, moon and star. Three of each in every row and column.',
  tents: 'Pair every tree with a tent. Match the counts and keep tents apart.',
  sudoku: 'Digits 1–9 once in every row, column and box.',
  'killer-sudoku': 'Complete the Sudoku and match each cage total.',
  nurikabe: 'Shade a connected sea around islands. Match each island’s number.',
}

// Keep full save validation, including the Word Paths vocabulary, out of the initial bundle.
async function savedTime(puzzle: Puzzle): Promise<number | null> {
  if (isMarksPuzzle(puzzle)) return (await import('../lib/marksProgress')).readMarksProgress(puzzle.id, puzzle.board)?.elapsedMs ?? null
  if (isTracksPuzzle(puzzle)) return (await import('../lib/trackProgress')).readTrackProgress(puzzle.id, puzzle.board)?.elapsedMs ?? null
  if (isTrioPuzzle(puzzle)) return (await import('../lib/trioProgress')).readTrioProgress(puzzle.board, true)?.elapsedMs ?? null
  if (isSudokuPuzzle(puzzle)) return (await import('../lib/sudokuProgress')).readSudokuProgress(puzzle.board, true)?.elapsedMs ?? null
  if (isNurikabePuzzle(puzzle)) return (await import('../lib/nurikabeProgress')).readNurikabeProgress(puzzle.board, true)?.elapsedMs ?? null
  if (isTentsPuzzle(puzzle)) return (await import('../lib/tentsProgress')).readTentsProgress(puzzle.board, true)?.elapsedMs ?? null
  return puzzle.board instanceof WordGrid ? (await import('../lib/wordProgress')).readWordProgress(puzzle.id, puzzle.board)?.elapsedMs ?? null : null
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
  const todayId = useToday(timeZone)
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  // Read once, like the archive does: history is not going to change while the
  // page is open, and the cards only use it to say what has been solved today.
  const [solved] = useState(() => new Set(readStoredStats().map((record) => record.id)))

  useEffect(() => {
    let cancelled = false
    // `probePuzzles` never rejects: each id fails alone, so there is no whole-page
    // failure left to handle here.
    probePuzzles(puzzleIdsForDay(todayId)).then(async (probes) => {
      if (cancelled) return
      setState({ status: 'ready', day: todayId, probes })
      const attempts = await Promise.all(probes.map(async probe => {
        try { return { ...probe, elapsedMs: probe.puzzle && !solved.has(probe.id) ? await savedTime(probe.puzzle) : null } }
        catch { return { ...probe, elapsedMs: null } }
      }))
      if (!cancelled) setState({ status: 'ready', day: todayId, probes: attempts })
    })
    return () => {
      cancelled = true
    }
  }, [todayId, solved])

  // A result for a previous day is not today's answer. Keeping the day beside
  // the probes lets a rollover show the loading state until the new day lands,
  // without an effect writing loading and triggering a second render.
  const ready = state.status === 'ready' && state.day === todayId ? state : null

  return (
    <section className="today">
      <div className="today-heading">
        <p className="eyebrow">{formatPuzzleLabel(todayId, timeZone)}</p>
        <h1 className="page-title">Today&rsquo;s puzzles</h1>
        <p className="page-intro">Fresh logic puzzles, every day. Pick your challenge.</p>
      </div>
      {ready === null && <p className="status">Checking what&rsquo;s out…</p>}
      {ready !== null && (
        <TodayCards probes={ready.probes} solved={solved} />
      )}
      <div className="today-more">
        <Link to="/preview/nurikabe">Nurikabe practice boards <span aria-hidden="true">→</span></Link>
        <Link to="/learn">Learn to solve <span aria-hidden="true">→</span></Link>
        <Link to="/preview/sudoku">Sudoku practice boards <span aria-hidden="true">→</span></Link>
        <Link to="/preview/killer-sudoku">Killer Sudoku practice boards <span aria-hidden="true">→</span></Link>
        <p>Another round?</p>
        <Link to="/archive">Explore the archive <span aria-hidden="true">→</span></Link>
        <Link to="/stats">Your progress <span aria-hidden="true">→</span></Link>
      </div>
    </section>
  )
}

/** Rendering is shared by the daily page and controlled publication-state tests. */
export function TodayCards({ probes, solved }: {
  readonly probes: readonly TodayPuzzle[]
  readonly solved: ReadonlySet<string>
}) {
  const groups = new Map<PuzzleType, TodayPuzzle[]>()
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
        const sized = family === 'sudoku' || family === 'killer-sudoku' || family === 'train-tracks' && trackVariantOf(probe.id) !== null
        const again = solved.has(probe.id)
        const elapsed = !again ? probe.elapsedMs ?? null : null
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
                  const variant = family === 'sudoku' ? sudokuVariantOf(entry.id)! : family === 'killer-sudoku' ? killerVariantOf(entry.id)! : trackVariantOf(entry.id)!
                  const label = 'side' in variant ? `${variant.label} · ${variant.side}×${variant.side}` : variant.label
                  const again = solved.has(entry.id)
                  const elapsed = !again ? entry.elapsedMs ?? null : null
                  return (
                    <li key={entry.id}>
                      {entry.puzzle === null ? (
                        <div className="track-unpublished">
                          <span>{label}</span><span className="game-card-state">{entry.unavailable ? 'Not saved — connect to load.' : 'Not published yet.'}</span>
                        </div>
                      ) : (
                        <Link className="tool-button track-choice" to={`/archive/${entry.id}`}
                          aria-label={`${elapsed === null ? 'Play' : 'Resume'} ${PUZZLE_TYPE_LABEL[family]} ${variant.label}${again ? ' again' : elapsed !== null ? ` at ${formatTime(elapsed)}` : ''}`}>
                          <span>{label}</span>
                          <span className={again ? 'solved' : ''}>{again ? 'Solved' : elapsed !== null ? `Resume · ${formatTime(elapsed)}` : 'Play'} <span aria-hidden="true">↗</span></span>
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
                    {again && <p className="game-card-state solved">Solved today.</p>}
                    <Link className="tool-button primary" to={`/archive/${probe.id}`}
                      aria-label={`${elapsed === null ? 'Play' : 'Resume'} ${PUZZLE_TYPE_LABEL[family]}${again ? ' again' : elapsed !== null ? ` at ${formatTime(elapsed)}` : ''}`}>
                      {again ? 'Play again' : elapsed !== null ? `Resume · ${formatTime(elapsed)}` : 'Play'} <span aria-hidden="true">↗</span>
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
