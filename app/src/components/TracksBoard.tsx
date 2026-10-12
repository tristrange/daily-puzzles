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
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react'
import { PUZZLE_TYPE_LABEL } from '../domain/games'
import { PIECE_GLYPHS, TrackGrid } from '../domain/tracks'
import type { TrackConflict, TracksGame } from '../domain/tracksGame'

export interface TracksBoardProps {
  grid: TrackGrid
  game: TracksGame
  /** What is wrong, if anything. A cell can break several rules at once. */
  conflicts: readonly TrackConflict[]
  locked?: boolean
  onCycle: (cell: number) => void
  onClear: (cell: number) => void
  onUndo: () => void
}

/**
 * What `conflict` is called out loud.
 *
 * Each rule gets its own sentence because one sentence for all of them names the
 * wrong fault: a route that is fully connected and simply over a row clue is not
 * "not connected", and saying so names a fault the player does not have while
 * hiding the one they do.
 */
function reasonFor(grid: TrackGrid, conflict: TrackConflict): string {
  switch (conflict.rule) {
    case 'unmet-end': {
      const other = conflict.other
      if (other === undefined) return ', does not meet its neighbour'
      const { row, col } = grid.coords(other)
      return `, does not meet row ${row + 1}, column ${col + 1}`
    }
    case 'off-grid-end':
      return ', runs off the grid, and only the line\u2019s two ends may'
    case 'row-count':
      return `, row ${(conflict.other ?? 0) + 1} already holds its full count`
    case 'col-count':
      return `, column ${(conflict.other ?? 0) + 1} already holds its full count`
  }
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
  conflicts,
  locked = false,
  onCycle,
  onClear,
  onUndo,
}: TracksBoardProps) {
  const [focusIndex, setFocusIndex] = useState(0)
  const boardRef = useRef<HTMLDivElement>(null)

  // Moving the roving index is not the same as moving focus, and only the second
  // one moves the focus ring and the screen reader's cursor. Without this, an
  // arrow key acted on the new cell while the board still *looked* focused on the
  // old one — Enter placing a piece the player cannot see where it went.
  //
  // Guarded on the board already holding focus, so mounting does not steal the
  // page's focus from wherever the player actually is.
  useEffect(() => {
    const board = boardRef.current
    if (board === null || !board.contains(document.activeElement)) return
    board.querySelector<HTMLElement>(`[data-cell="${focusIndex}"]`)?.focus()
  }, [focusIndex])
  const puzzleName = PUZZLE_TYPE_LABEL['train-tracks'].toLowerCase()

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (locked) return
    if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
      event.preventDefault()
      onUndo()
      return
    }
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

  const conflictCells = useMemo(
    () => new Set(conflicts.map((conflict) => conflict.cell)),
    [conflicts],
  )

  // Each rule gets its own words. One word for all of them was worse than none: a
  // fully connected route that simply exceeds a row clue was announced as "not
  // connected", which names a fault the player does not have and hides the one
  // they do. A cell can break several, so the reasons are collected and joined.
  const faults = useMemo(() => {
    const text = new Map<number, string>()
    for (const conflict of conflicts) {
      const words = reasonFor(grid, conflict)
      text.set(conflict.cell, text.has(conflict.cell) ? `${text.get(conflict.cell)}, ${words}` : words)
    }
    return text
  }, [conflicts, grid])

  const labelFor = (cell: number): string => {
    const { row, col } = grid.coords(cell)
    const given = grid.pieceAt(cell)
    const piece = pieceAt(cell)
    const what = given !== 0 ? `given ${PIECE_NAME[piece] ?? 'track'}` : PIECE_NAME[piece] ?? 'empty'
    const clue = `, row needs ${grid.rowClues[row] ?? 0}, column needs ${grid.colClues[col] ?? 0}`
    return `Row ${row + 1}, column ${col + 1}, ${what}${clue}${faults.get(cell) ?? ''}`
  }

  const classNameFor = (cell: number): string => {
    const classes = ['cell']
    // A given is a clue, and the player has to be able to see which pieces are
    // clues while playing. Nothing else says so: clicking one does nothing, which
    // without this reads as a broken board rather than a fixed cell.
    if (grid.pieceAt(cell) !== 0) classes.push('given')
    if (conflictCells.has(cell)) classes.push('conflict')
    return classes.join(' ')
  }

  const renderCell = (cell: number) => (
    <div
      key={cell}
      role="gridcell"
      data-cell={cell}
      aria-label={labelFor(cell)}
      className={classNameFor(cell)}
      tabIndex={cell === focusIndex ? 0 : -1}
      onClick={() => {
        if (locked) return
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
        ref={boardRef}
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
