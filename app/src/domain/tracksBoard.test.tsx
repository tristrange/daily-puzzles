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
import type { TrackConflict } from './tracksGame'
import { applyBrush, createTracksGame, CROSS, MAYBE, type TracksGame } from './tracksGame'
import { TrackPicker } from '../components/TrackPicker'
import { TracksBoard } from '../components/TracksBoard'

const GRID = new TrackGrid(3, 3, [0, 3, 0], [1, 1, 1], [0, 0, 0, 1, 0, 1, 0, 0, 0])

const NOOP = () => {}

function render(game: TracksGame): string {
  return renderToStaticMarkup(
    <TracksBoard
      grid={GRID}
      game={game}
      conflicts={[]}
      brush={1}
      onBrush={NOOP}
      onClear={NOOP}
      onUndo={NOOP}
      onGestureStart={NOOP}
      onPaint={NOOP}
      onGestureEnd={NOOP}
    />,
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

  it('draws a piece as arms to the edges it ends in, not as a glyph', () => {
    // Two adjacent cells whose pieces meet have to look joined. A font character
    // cannot be made to reach the edges, and the gap it leaves makes a connected
    // line look broken — which is the one thing this genre cannot afford, because
    // reciprocity is the rule.
    const solved: TracksGame = { grid: GRID, pieces: [0, 0, 0, 1, 1, 1, 0, 0, 0] }
    const markup = render(solved)
    // Cell 3's piece ends east and west, so one arm each way.
    expect(markup).toContain('track-arm e')
    expect(markup).toContain('track-arm w')
    expect(markup.match(/gridcell/g)).toHaveLength(9)
    // Exactly two arms per piece, never a glyph that might not reach the edge.
    expect(markup.match(/track-piece/g)).toHaveLength(3)
    expect(markup).not.toContain('─')
  })

  it('draws a turn with one arm per direction it ends in', () => {
    // Piece 5 ends south and west; piece 3 ends north and east.
    expect(render({ grid: GRID, pieces: [5, 0, 0, 1, 0, 1, 0, 0, 0] })).toContain('track-arm w')
    expect(render({ grid: GRID, pieces: [3, 0, 0, 1, 0, 1, 0, 0, 0] })).toContain('track-arm e')
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

  it('names the fault a cell has, rather than one word for every fault', () => {
    // A fully connected route that is simply over a row clue is not "not
    // connected". One sentence for all four rules names a fault the player does
    // not have and hides the one they do, which is worse than saying nothing.
    const words = (conflicts: TrackConflict[]) =>
      renderToStaticMarkup(
        <TracksBoard
          grid={GRID}
          game={createTracksGame(GRID)}
          conflicts={conflicts}
          brush={1}
          onBrush={NOOP}
          onClear={NOOP}
          onUndo={NOOP}
          onGestureStart={NOOP}
          onPaint={NOOP}
          onGestureEnd={NOOP}
        />,
      )

    expect(words([{ rule: 'mismatched-end', cell: 4, other: 7 }])).toContain(
      'does not meet row 3, column 2',
    )
    expect(words([{ rule: 'row-count', cell: 4, other: 1 }])).toContain(
      'row 2 already holds its full count',
    )
    expect(words([{ rule: 'col-count', cell: 4, other: 1 }])).toContain(
      'column 2 already holds its full count',
    )
    expect(words([{ rule: 'off-grid-end', cell: 4 }])).toContain('runs off the grid')
    // Several rules on one cell, rather than only the last one.
    const both = words([
      { rule: 'mismatched-end', cell: 4, other: 7 },
      { rule: 'row-count', cell: 4, other: 1 },
    ])
    expect(both).toContain('does not meet row 3, column 2')
    expect(both).toContain('row 2 already holds its full count')
  })

  it('marks a given apart from a piece the player placed', () => {
    // Nothing else says so: clicking a given does nothing, which without a
    // visible treatment reads as a broken board rather than a fixed cell.
    const markup = render({ grid: GRID, pieces: [1, 0, 0, 1, 0, 1, 0, 0, 0] })
    expect(markup).toContain('cell given')
    // Cells 3 and 5 are givens; cell 0 is the player's and must not be marked.
    expect(markup.match(/cell given/g)).toHaveLength(2)
  })

  it('draws a cross and a maybe, and tells a screen reader which is which', () => {
    // The two notes are opposites and must not read as the same cell, so they get
    // their own glyphs and their own words. Neither is a piece, and a screen
    // reader told "a horizontal track" about a crossed-out cell has been told a
    // lie that would then be counted towards the win check.
    const marked = applyBrush(applyBrush(createTracksGame(GRID), 0, CROSS), 1, MAYBE)
    const markup = render(marked)
    expect(markup).toContain('marker mark')
    expect(markup).toContain('marker maybe')
    expect(markup).toContain('Row 1, column 1, marked out')
    expect(markup).toContain('Row 1, column 2, a track, direction not decided')
    // Neither draws a track, so the arms count is unchanged from the givens alone.
    expect(markup.match(/track-piece/g)).toHaveLength(2)
  })

  it('offers every way of filling a cell in the picker, and marks the picked one', () => {
    // Nine entries: two notes, six tracks, an eraser. A picker that was missing
    // one would silently remove the only route to that state once cycling is gone.
    const markup = renderToStaticMarkup(<TrackPicker brush={4} onPick={NOOP} />)
    expect(markup).toContain('radiogroup')
    // Named, because a piece face is drawn rather than typed and carries no text:
    // a radio announced only as "radio button, 4 of 9" is a nine-way choice
    // nobody can take.
    for (const label of ['Marked out', 'Eraser', 'A horizontal track', 'A vertical track']) {
      expect(markup).toContain(`aria-label="${label}"`)
    }
    expect(markup.match(/type="radio"/g)).toHaveLength(9)
    // One checked, and it is the one that was passed in.
    expect(markup.match(/checked=""/g)).toHaveLength(1)
    expect(markup).toContain('aria-label="A track turning east to south" name="track-brush" checked=""')
  })
})