import { Link, useSearchParams } from 'react-router-dom'
import { parsePuzzle } from '../domain/puzzle'
import { WordGrid } from '../domain/wordPaths'
import { WordPathsStage } from '../components/WordPathsStage'

const samples = import.meta.glob('@shared/conformance/word-paths/v2/*-words.json', { eager: true, import: 'default' })
const WORD_PATHS_PREVIEWS = Object.entries(samples).sort(([a], [b]) => a.localeCompare(b)).map(([, raw]) => {
  const puzzle = parsePuzzle(raw)
  if (puzzle.puzzleType !== 'word-paths' || !(puzzle.board instanceof WordGrid)) throw new Error('Expected a Word Paths preview')
  return { puzzle, grid: puzzle.board }
})

export function WordPathsPreviewPage() {
  const [params, setParams] = useSearchParams()
  const requested = Number(params.get('board') ?? '1')
  const index = Number.isInteger(requested) && requested >= 1 && requested <= WORD_PATHS_PREVIEWS.length ? requested - 1 : 0
  const sample = WORD_PATHS_PREVIEWS[index]!
  return (
    <section className="puzzle-page word-preview">
      <Link to={{ pathname: '/how-to-play', hash: '#word-paths' }} className="back-link" aria-label="Word Paths rules"><span aria-hidden="true">←</span><span className="back-label">How to play</span></Link>
      <article className="puzzle">
        <div className="puzzle-heading">
          <p className="eyebrow">Playtest preview</p><h1>Word Paths</h1>
          <p className="puzzle-detail">Board {index + 1} of {WORD_PATHS_PREVIEWS.length} · 5×5</p>
        </div>
        <div className="word-preview-picker">
          <label htmlFor="word-preview-board">Choose a board</label>
          <select id="word-preview-board" value={index + 1} onChange={(event) => setParams({ board: event.target.value })}>
            {WORD_PATHS_PREVIEWS.map((_, i) => <option key={i} value={i + 1}>Board {i + 1}</option>)}
          </select>
        </div>
        <WordPathsStage key={sample.puzzle.id} puzzle={sample.puzzle} grid={sample.grid}
          timeZone={Intl.DateTimeFormat().resolvedOptions().timeZone} previewBoard={index + 1} />
        <p className="word-note preview-note">Preview solves do not count toward daily stats or streaks. Your progress is saved separately.</p>
      </article>
    </section>
  )
}
