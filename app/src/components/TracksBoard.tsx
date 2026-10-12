/**
 * The playable Train Tracks board: a semantic ARIA grid a keyboard user can drive
 * end to end. The focused cell uses a roving tabindex (exactly one cell is in the
 * tab order), and the arrow keys move the focus. Enter/Space puts the picked
 * brush in the cell, `1`-`6` put a particular track straight in without touching
 * the picker, `x` marks a cell out, `?` says a track is certain but its direction
 * is not, Delete/Backspace clears it, and Ctrl/Command+Z undoes.
 *
 * ## Why a picker rather than a cycle
 *
 * The marks board cycles empty -> mark -> piece because it has three states. A
 * cell here has nine: the six tracks plus empty, a cross and a maybe. Cycling
 * through nine states to reach one is unusable on a board of twenty-odd pieces, so
 * the choice moves to `TrackPicker` and the click stays one gesture. The arms
 * still run off the cell's own edge, which is what makes reciprocity something the
 * player sees rather than infers.
 *
 * ## Pointer
 *
 * A click puts the picked brush in the cell. Right-click erases, which is the one
 * thing the picker cannot do for you mid-thought — you reach for it after the
 * mistake, not before it — and `contextmenu` is the event a two-finger click on a
 * trackpad raises, so this is the same gesture on a Mac as on a mouse.
 *
 * Pressing and dragging applies the brush to every cell the pointer crosses, so a
 * run of exclusions is one stroke rather than nine clicks. The stroke is one
 * gesture as far as undo is concerned: the board reports the start and the end of
 * it and the view snapshots on the first, so crossing out four cells in a row is
 * one Undo rather than four.
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
  type PointerEvent,
} from 'react'
import { PUZZLE_TYPE_LABEL } from '../domain/games'
import { TrackGrid } from '../domain/tracks'
import { TrackPiece } from './TrackPiece'
import {
  cellState,
  CROSS,
  MAYBE,
  TRACK_CELL_NAME,
  type TrackBrush,
  type TrackConflict,
  type TracksGame,
} from '../domain/tracksGame'

export interface TracksBoardProps {
  grid: TrackGrid
  game: TracksGame
  /** What is wrong, if anything. A cell can break several rules at once. */
  conflicts: readonly TrackConflict[]
  locked?: boolean
  /** What a click puts in a cell. Held here so a drag can carry it. */
  brush: TrackBrush
  /** One cell changed, and counts as one move in the history. */
  onBrush: (cell: number, brush: TrackBrush) => void
  onClear: (cell: number) => void
  onUndo: () => void
  /** A press landed: snapshot the state so the whole stroke is one undo step. */
  onGestureStart: () => void
  /** A cell entered mid-drag. Changes nothing in the history yet. */
  onPaint: (cell: number, brush: TrackBrush) => void
  /**
   * The stroke ended. A non-null `clickedCell` means it never left its cell, and
   * the view applies the click over the top of the paint from the pre-press
   * snapshot; null means the painted board is what happened.
   */
  onGestureEnd: (clickedCell: number | null, brush: TrackBrush) => void
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
    case 'mismatched-end': {
      const other = conflict.other
      if (other === undefined) return ', does not meet its neighbour'
      const { row, col } = grid.coords(other)
      return `, does not meet row ${row + 1}, column ${col + 1}`
    }
    case 'unfinished-end':
      // Unreachable through this component — `TracksStage` filters these out, and
      // an end pointing at an empty cell is the normal state of an unfinished
      // board rather than something to mark. Kept so the switch is total, and said
      // plainly if it ever arrives.
      return ', still needs to reach its neighbour'
    case 'off-grid-end':
      return ', runs off the grid, and only the line\u2019s two ends may'
    case 'row-count':
      return `, row ${(conflict.other ?? 0) + 1} already holds its full count`
    case 'col-count':
      return `, column ${(conflict.other ?? 0) + 1} already holds its full count`
  }
}

export function TracksBoard({
  grid,
  game,
  conflicts,
  locked = false,
  brush,
  onBrush,
  onClear,
  onUndo,
  onGestureStart,
  onPaint,
  onGestureEnd,
}: TracksBoardProps) {
  const [focusIndex, setFocusIndex] = useState(0)
  const boardRef = useRef<HTMLDivElement>(null)
  const [painting, setPainting] = useState(false)
  const stroke = useRef<{
    pointerId: number
    firstCell: number
    lastCell: number
    dragged: boolean
  } | null>(null)

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

  // The stroke ends wherever the pointer is released, including off the board, so
  // the listener is on the window for as long as one is live. The handler is held
  // in a ref because painting re-renders on every cell the pointer crosses, and
  // re-subscribing per cell would be pure churn.
  const end = useRef(onGestureEnd)
  useEffect(() => {
    end.current = onGestureEnd
  })
  useEffect(() => {
    if (!painting) return
    const finish = (event: WindowEventMap['pointerup']) => {
      const current = stroke.current
      if (current === null || event.pointerId !== current.pointerId) return
      stroke.current = null
      setPainting(false)
      // The first cell is already painted, so a press that never left it has
      // still happened: the view reapplies it from the snapshot as a click, and
      // one that did move has painted its run and needs committing as it stands.
      end.current(current.dragged ? null : current.firstCell, brush)
    }
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
    return () => {
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
    }
  }, [brush, painting])

  const beginStroke = (event: PointerEvent<HTMLDivElement>, cell: number) => {
    // `ctrlKey` because on macOS the browser reports a two-finger click as a
    // *primary* press with the modifier set, not as button 2. Without this the
    // board paints the brush and then the contextmenu handler erases it, and the
    // cell ends up as the erase left it — which looks like a broken right-click.
    if (locked || event.button !== 0 || event.ctrlKey) return
    stroke.current = { pointerId: event.pointerId, firstCell: cell, lastCell: cell, dragged: false }
    onGestureStart()
    onPaint(cell, brush)
    setPainting(true)
  }

  const continueStroke = (event: PointerEvent<HTMLDivElement>) => {
    const current = stroke.current
    if (current === null || locked || event.pointerId !== current.pointerId) return
    // Touch captures the pointer on the first cell, so the event target is not
    // the cell under the cursor; ask the document what is there.
    const under = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-cell]')
    if (under === null || under === undefined) return
    const cell = Number(under.getAttribute('data-cell'))
    if (!Number.isInteger(cell) || cell === current.lastCell) return
    current.dragged = true
    current.lastCell = cell
    onPaint(cell, brush)
  }

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
        onBrush(focusIndex, brush)
        break
      // One key per state, the way the marks board has one key per mark. Without
      // these, Enter with a fixed brush would put the same piece in every cell,
      // which is worse than the cycle it replaced: it cannot reach the other six.
      case 'x':
      case 'X':
        event.preventDefault()
        onBrush(focusIndex, CROSS)
        break
      case '?':
        event.preventDefault()
        onBrush(focusIndex, MAYBE)
        break
      case '1':
      case '2':
      case '3':
      case '4':
      case '5':
      case '6':
        event.preventDefault()
        onBrush(focusIndex, Number(event.key))
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
    const what =
      grid.pieceAt(cell) !== 0
        ? `given ${TRACK_CELL_NAME[pieceAt(cell)] ?? 'track'}`
        : TRACK_CELL_NAME[pieceAt(cell)] ?? 'empty'
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

  const renderCell = (cell: number) => {
    const state = cellState(game, cell)
    return (
      <div
        key={cell}
        role="gridcell"
        data-cell={cell}
        aria-label={labelFor(cell)}
        className={classNameFor(cell)}
        tabIndex={cell === focusIndex ? 0 : -1}
        onPointerDown={(event) => beginStroke(event, cell)}
        onPointerMove={continueStroke}
        onContextMenu={(event) => {
          event.preventDefault()
          if (locked) return
          onBrush(cell, 0)
        }}
        onFocus={() => setFocusIndex(cell)}
      >
        {state === 'piece' && (
          <span className="marker">
            <TrackPiece piece={pieceAt(cell)} />
          </span>
        )}
        {state === 'cross' && (
          <span className="marker mark" aria-hidden="true">
            &times;
          </span>
        )}
        {state === 'maybe' && (
          <span className="marker maybe" aria-hidden="true">
            ?
          </span>
        )}
      </div>
    )
  }

  return (
    <div
      className="tracks"
      style={
        {
          '--tracks-cols': grid.width,
          '--tracks-rows': grid.height,
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
        className={painting ? 'board playable painting' : 'board playable'}
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
