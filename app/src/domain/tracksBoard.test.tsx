/**
 * What the board actually puts on the screen.
 *
 * Rendered to static markup rather than driven: there is no DOM test library in
 * this project and adding one to assert what a component emits would be a large
 * dependency for a small claim. What matters here is that the *puzzle* reaches
 * the player — the clues, the pieces and the per-cell words a screen reader says —
 * and every one of those is a string that either appears or does not.
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TrackGrid } from './tracks'
import { createTracksGame, type TracksGame } from './tracksGame'
import { TracksBoard } from '../components/TracksBoard'

const GRID = new TrackGrid(3, 3, [0, 3, 0], [1, 1, 1], [0, 0, 0, 1, 0, 1, 0, 0, 0])

function render(game: TracksGame): string {
  return renderToStaticMarkup(
    <TracksBoard grid={GRID} game={game} conflictCells={new Set()} onCycle={() => {}} onClear={() => {}} onUndo={() => {}} />,
  )
}

describe('TracksBoard', () => {
  it('draws every clue, so a player can read the puzzle off the screen', () => {
    const markup = render(createTracksGame(GRID))
    // Column clues 1,1,1 above and the row clue 3 beside the middle row. The two
    // zeros either side of it are the point: an empty row still has a clue.
    for (const clue of ['>0<', '>3<', '>1<']) expect(markup).toContain(clue)
  })

  it('names the board and its counts for a screen reader', () => {
    const markup = render(createTracksGame(GRID))
    expect(markup).toContain('3 by 3 train tracks puzzle')
    expect(markup).toContain('Rows need 0, 3, 0 cells')
    expect(markup).toContain('columns need 1, 1, 1')
  })

  it('draws a placed piece as its own glyph, not as a filled square', () => {
    // A solved board: the shape of the line is the answer, so a glyph that does
    // not show the turn would give the share nothing away.
    const solved: TracksGame = { grid: GRID, pieces: [0, 0, 0, 1, 1, 1, 0, 0, 0] }
    const markup = render(solved)
    expect(markup).toContain('─')
    expect(markup.match(/gridcell/g)).toHaveLength(9)
  })

  it('says what each cell holds, in words', () => {
    const markup = render(createTracksGame(GRID))
    // Cell 3 is a given; cell 4 is empty.
    expect(markup).toContain('Row 2, column 1, given a horizontal track')
    expect(markup).toContain('Row 2, column 2, empty')
    // The counts belong in the label too, or a screen-reader user has to hold the
    // whole grid in their head to use them.
    expect(markup).toContain('row needs 3, column needs 1')
  })

  it('marks a conflicting cell in words as well as colour', () => {
    const markup = renderToStaticMarkup(
      <TracksBoard
        grid={GRID}
        game={createTracksGame(GRID)}
        conflictCells={new Set([4])}
        onCycle={() => {}}
        onClear={() => {}}
        onUndo={() => {}}
      />,
    )
    expect(markup).toContain('not connected')
  })
})