/**
 * The playable Train Tracks board: a semantic ARIA grid a keyboard user can drive
 * end to end. The focused cell uses a roving tabindex (exactly one cell is in the
 * tab order), and the arrow keys move the focus. Enter/Space cycles the piece in
 * the cell, Delete/Backspace clears it, and Ctrl/Command+Z undoes.
 *
 * ## Why cycling rather than placing and rotating
 *
 * The marks board cycles empty -> mark -> piece because it has three states. A
 * cell here has seven: empty and six pieces, where the piece *is* the orientation.
 * So there is no separate rotate gesture to invent and no second place for it to
 * disagree with the model — but the cost is real, and a board of twenty-odd pieces
 * is a lot of clicking. It is the honest consequence of the rules rather than a
 * design that chose the wrong shape.
 *
 * The counts outside the grid are the clues and are part of the puzzle, so they
 * are drawn rather than left in the file: a row clue that a player has to count
 * cells to find is a clue they cannot use.
 */

import {
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import { PUZZLE_TYPE_LABEL } from '../domain/games'
import { PIECE_GLYPHS, TrackGrid } from '../domain/tracks'
import type { TracksGame } from '../domain/tracksGame'

export interface TracksBoardProps {
  grid: TrackGrid
  game: TracksGame
  conflictCells: ReadonlySet<number>
  locked?: boolean
  onCycle: (cell: number) => void
  onClear: (cell: number) => void
  onUndo: () => void
}

/** What each piece is called out loud, so a screen reader says more than a glyph. */
const PIECE_NAME: readonly string[] = [
  'empty',
  'a horizontal track',
  'a vertical track',
  'a track turning north to east',
  'a track turning east to south',
  'a track turning south to west',
  'a track turning west to north',
]

export function TracksBoard({
  grid,
  game,
  conflictCells,
  locked = false,
  onCycle,
  onClear,
  onUndo,
}: TracksBoardProps) {
  const [focusIndex, setFocusIndex] = useState(0)
  const puzzleName = PUZZLE_TYPE_LABEL['train-tracks'].toLowerCase()

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
      event.preventDefault()
      onUndo()
      return
    }
    if (locked) return
    const { row, col } = grid.coords(focusIndex)
    switch (event.key) {
      case 'ArrowUp':
        event.preventDefault()
        if (row > 0) setFocusIndex(focusIndex - grid.width)
        break
      case 'ArrowDown':
        event.preventDefault()
        if (row < grid.height - 1) setFocusIndex(focusIndex + grid.width)
        break
      case 'ArrowLeft':
        event.preventDefault()
        if (col > 0) setFocusIndex(focusIndex - 1)
        break
      case 'ArrowRight':
        event.preventDefault()
        if (col < grid.width - 1) setFocusIndex(focusIndex + 1)
        break
      case 'Home':
        event.preventDefault()
        setFocusIndex(row * grid.width)
        break
      case 'End':
        event.preventDefault()
        setFocusIndex(row * grid.width + grid.width - 1)
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        onCycle(focusIndex)
        break
      case 'Delete':
      case 'Backspace':
        event.preventDefault()
        onClear(focusIndex)
        break
    }
  }

  const pieceAt = (cell: number): number => game.pieces[cell] ?? 0

  const labelFor = (cell: number): string => {
    const { row, col } = grid.coords(cell)
    const given = grid.pieceAt(cell)
    const piece = pieceAt(cell)
    const what = given !== 0 ? `given ${PIECE_NAME[piece] ?? 'track'}` : PIECE_NAME[piece] ?? 'empty'
    const clue = `, row needs ${grid.rowClues[row] ?? 0}, column needs ${grid.colClues[col] ?? 0}`
    const conflict = conflictCells.has(cell) ? ', not connected' : ''
    return `Row ${row + 1}, column ${col + 1}, ${what}${clue}${conflict}`
  }

  const classNameFor = (cell: number): string =>
    conflictCells.has(cell) ? 'cell conflict' : 'cell'

  const renderCell = (cell: number) => (
    <div
      key={cell}
      role="gridcell"
      data-cell={cell}
      aria-label={labelFor(cell)}
      className={classNameFor(cell)}
      tabIndex={cell === focusIndex ? 0 : -1}
      onPointerDown={(event: PointerEvent<HTMLDivElement>) => {
        if (locked || event.button !== 0) return
        onCycle(cell)
      }}
      onFocus={() => setFocusIndex(cell)}
    >
      {pieceAt(cell) !== 0 && (
        <span className="marker" aria-hidden="true">
          {PIECE_GLYPHS[pieceAt(cell)]}
        </span>
      )}
    </div>
  )

  return (
    <div
      className="tracks"
      style={
        {
          '--tracks-cols': grid.width,
          '--tracks-gutter': '1.7em',
        } as CSSProperties
      }
    >
      {/*
        The clues are a gutter beside the grid, not cells in it: a row's count
        belongs to the row, not to the cell it happens to sit beside. Two sibling
        CSS grids with the same column template line their columns up without the
        clue ever entering the grid's rows, which is what keeps `role="grid"`
        honest — a `role="row"` may contain gridcells and nothing else.
      */}
      <div className="tracks-head" aria-hidden="true">
        <span className="tracks-count" />
        {grid.colClues.map((clue, col) => (
          <span key={col} className="tracks-count">
            {clue}
          </span>
        ))}
      </div>
      <div
        className="board playable"
        role="grid"
        aria-label={`${grid.width} by ${grid.height} ${puzzleName} puzzle. Rows need ${grid.rowClues.join(', ')} cells; columns need ${grid.colClues.join(', ')}`}
        onKeyDown={onKeyDown}
      >
        {Array.from({ length: grid.height }, (_, row) => (
          <div key={row} role="row" className="tracks-line">
            <span className="tracks-count" aria-hidden="true">
              {grid.rowClues[row]}
            </span>
            {Array.from({ length: grid.width }, (_, col) => renderCell(grid.index(row, col)))}
          </div>
        ))}
      </div>
    </div>
  )
}
