/**
 * The playable board: a semantic ARIA grid a keyboard user can drive end to
 * end. The focused cell uses a roving tabindex (exactly one cell is in the
 * tab order), and the arrow keys move the focus. Enter/Space place or take
 * back a piece, X toggles an X mark, Delete/Backspace clears the cell and H
 * asks for a hint; Ctrl/Command+Z undoes. A `locked` board still navigates by
 * keyboard but refuses to change any cell. The piece's name and glyph follow
 * the board's puzzle type (queen / star). Screen-reader users get a per-cell
 * label describing the position and contents; longer announcements (hint text,
 * conflict warnings) live in a visually hidden `aria-live` region owned by the
 * puzzle view.
 *
 * ## Pointer
 *
 * A left click cycles the cell — empty, then a mark, then a piece, then empty
 * again — so crossing out (by far the most common move) is one click and placing
 * a piece is two. Right-click still toggles a mark directly, for anyone who
 * would rather not cycle, and the keyboard keeps one key per state, because
 * cycling is a convenience for a mouse, not a rule the keyboard should pay for.
 *
 * Pressing and dragging paints marks across every cell the pointer crosses,
 * which is how a real player crosses out a row: the stroke starts wherever the
 * press landed, and starting on a cell that is *already* a mark erases instead,
 * so a misjudged stroke is undone by re-dragging along it. The whole stroke is
 * one gesture as far as undo is concerned, which is why the board reports the
 * gesture rather than the individual cells: the view snapshots the state on
 * `onGestureStart` and pushes a single history entry on `onGestureEnd`, and a
 * press that never left its cell is reported as a click so the view can apply
 * the full cycle over the top of the paint.
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
import type { Board } from '../domain/board'
import type { GameState } from '../domain/game'
import { cellState } from '../domain/game'
import { PUZZLE_PIECE } from '../domain/games'
import type { Hint } from '../domain/hints'
import { markInk, regionColours } from '../lib/colours'

export interface CellActionProps {
  board: Board
  game: GameState
  hint: Hint | null
  conflictCells: ReadonlySet<number>
  locked?: boolean
  onToggleQueen: (cell: number) => void
  onToggleMark: (cell: number) => void
  onClear: (cell: number) => void
  onRequestHint: () => void
  onUndo: () => void
  /** A left press landed: snapshot the state so the stroke is one undo step. */
  onGestureStart: () => void
  /** A cell entered mid-drag; `target` is fixed for the whole stroke. */
  onPaintCell: (cell: number, target: 'mark' | 'empty') => void
  /** The stroke ended. A non-null `clickedCell` means it never became a drag. */
  onGestureEnd: (clickedCell: number | null) => void
}

interface Stroke {
  pointerId: number
  firstCell: number
  lastCell: number
  target: 'mark' | 'empty'
  dragged: boolean
}

export function InteractiveBoard({
  board,
  game,
  hint,
  conflictCells,
  locked = false,
  onToggleQueen,
  onToggleMark,
  onClear,
  onRequestHint,
  onUndo,
  onGestureStart,
  onPaintCell,
  onGestureEnd,
}: CellActionProps) {
  const [focusIndex, setFocusIndex] = useState(0)
  const [painting, setPainting] = useState(false)
  const stroke = useRef<Stroke | null>(null)
  const piece = PUZZLE_PIECE[board.puzzleType]
  const puzzleName = board.puzzleType === 'queens' ? 'queens' : 'star battle'
  const colours = useMemo(() => regionColours(board), [board])
  // One style object per region rather than per cell: 64 cells re-deriving the
  // same eight colours on every pointer move during a stroke is waste.
  const styles = useMemo(
    () =>
      Array.from({ length: board.regionCount }, (_, region) => {
        const background = colours[region] ?? '#e5e4e7'
        return {
          backgroundColor: background,
          // Only the cross-out varies by cell. The piece is one fixed colour with
          // an outline, so a cell no longer has to say anything about it.
          '--mark-ink': markInk(background),
        } as CSSProperties
      }),
    [board, colours],
  )

  // The stroke ends wherever the pointer is released, including outside the
  // board, so the listener is on the window for as long as a stroke is live.
  // The handler is held in a ref because painting re-renders on every cell the
  // pointer crosses, and re-subscribing per cell would be pure churn.
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
      end.current(current.dragged ? null : current.firstCell)
    }
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
    return () => {
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
    }
  }, [painting])

  const beginStroke = (event: PointerEvent<HTMLDivElement>, cell: number) => {
    if (locked || event.button !== 0) return
    stroke.current = {
      pointerId: event.pointerId,
      firstCell: cell,
      lastCell: cell,
      // Starting on a mark means "undo these crosses", so the stroke erases.
      target: cellState(game, cell) === 'mark' ? 'empty' : 'mark',
      dragged: false,
    }
    onGestureStart()
    onPaintCell(cell, stroke.current.target)
    setPainting(true)
  }

  const continueStroke = (event: PointerEvent<HTMLDivElement>) => {
    const current = stroke.current
    if (current === null || locked || event.pointerId !== current.pointerId) return
    // The pointer is captured by the first cell for touch, so the event target
    // is not the cell under the cursor; ask the document what is there.
    const under = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-cell]')
    if (under === null || under === undefined) return
    const cell = Number(under.getAttribute('data-cell'))
    if (!Number.isInteger(cell) || cell === current.lastCell) return
    current.lastCell = cell
    if (cell !== current.firstCell) current.dragged = true
    onPaintCell(cell, current.target)
  }

  const moveFocus = (cell: number) => {
    setFocusIndex(Math.max(0, Math.min(board.cellCount - 1, cell)))
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
      event.preventDefault()
      onUndo()
      return
    }
    if (locked) return
    const { row, col } = board.coords(focusIndex)
    switch (event.key) {
      case 'ArrowUp':
        event.preventDefault()
        if (row > 0) moveFocus(focusIndex - board.size)
        break
      case 'ArrowDown':
        event.preventDefault()
        if (row < board.size - 1) moveFocus(focusIndex + board.size)
        break
      case 'ArrowLeft':
        event.preventDefault()
        if (col > 0) moveFocus(focusIndex - 1)
        break
      case 'ArrowRight':
        event.preventDefault()
        if (col < board.size - 1) moveFocus(focusIndex + 1)
        break
      case 'Home':
        event.preventDefault()
        moveFocus(row * board.size)
        break
      case 'End':
        event.preventDefault()
        moveFocus(row * board.size + board.size - 1)
        break
      case 'Enter':
      case ' ':
        event.preventDefault()
        onToggleQueen(focusIndex)
        break
      case 'x':
      case 'X':
        event.preventDefault()
        onToggleMark(focusIndex)
        break
      case 'Delete':
      case 'Backspace':
        event.preventDefault()
        onClear(focusIndex)
        break
      case 'h':
      case 'H':
        event.preventDefault()
        onRequestHint()
        break
    }
  }

  /**
   * The cell each region's star count is drawn in.
   *
   * The first cell of a region in row-major order is its top-left cell, which is
   * where Star Battle puts the count and where it does not collide with the
   * marker in the middle. Only regions needing more than one are drawn: in
   * Queens every region holds exactly one, so a digit on all of them would be
   * 64 redundant numbers saying nothing.
   */
  const countAnchors = useMemo(() => {
    const anchors = new Map<number, number>()
    for (let cell = 0; cell < board.cellCount; cell += 1) {
      const region = board.regionAt(cell)
      if ((board.regionCapacity[region] ?? 0) > 1 && !anchors.has(region)) anchors.set(region, cell)
    }
    return anchors
  }, [board])

  const countFor = (cell: number): number => {
    const region = board.regionAt(cell)
    return countAnchors.get(region) === cell ? (board.regionCapacity[region] ?? 0) : 0
  }

  const labelFor = (cell: number): string => {
    const { row, col } = board.coords(cell)
    const position = `Row ${row + 1}, column ${col + 1}`
    const contents =
      cellState(game, cell) === 'queen'
        ? piece.noun
        : cellState(game, cell) === 'mark'
          ? 'marked'
          : 'empty'
    const region = board.regionAt(cell)
    // Only stated where it is not already implied. A screen reader user landing
    // on a cell in a Star Battle region needs to know what that region owes.
    const capacity = board.regionCapacity[region] ?? 0
    const needs = capacity > 1 ? `, region holds ${capacity} ${piece.plural}` : ''
    const conflict = conflictCells.has(cell) ? `, conflicting ${piece.noun}` : ''
    return `${position}, ${contents}${needs}${conflict}`
  }

  const classNameFor = (cell: number): string => {
    const classes = ['cell']
    if (hint !== null && hint.cell === cell) {
      classes.push(hint.action === 'queen' ? 'hint-queen' : 'hint-mark')
    }
    if (conflictCells.has(cell)) classes.push('conflict')
    return classes.join(' ')
  }

  const renderCell = (cell: number, region: number) => (
    <div
      key={cell}
      role="gridcell"
      data-cell={cell}
      aria-label={labelFor(cell)}
      className={classNameFor(cell)}
      style={styles[region]}
      tabIndex={cell === focusIndex ? 0 : -1}
      onPointerDown={(event) => beginStroke(event, cell)}
      onContextMenu={(event) => {
        event.preventDefault()
        if (!locked) onToggleMark(cell)
      }}
      onFocus={() => setFocusIndex(cell)}
    >
      {countFor(cell) > 1 && (
        <span className="capacity" aria-hidden="true">
          {countFor(cell)}
        </span>
      )}
      {cellState(game, cell) === 'queen' && (
        <span className="marker" aria-hidden="true">
          {piece.glyph}
        </span>
      )}
      {cellState(game, cell) === 'mark' && (
        <span className="marker mark" aria-hidden="true">
          ×
        </span>
      )}
    </div>
  )

  return (
    <div
      className={painting ? 'board playable painting' : 'board playable'}
      role="grid"
      aria-label={`${board.size} by ${board.size} ${puzzleName} puzzle with ${board.regionCount} regions`}
      style={{ gridTemplateColumns: `repeat(${board.size}, 1fr)` }}
      onKeyDown={onKeyDown}
      onPointerMove={continueStroke}
    >
      {Array.from({ length: board.size }, (_, row) => (
        <div key={row} role="row" style={{ display: 'contents' }}>
          {Array.from({ length: board.size }, (_, col) => {
            const cell = board.index(row, col)
            return renderCell(cell, board.regionAt(cell))
          })}
        </div>
      ))}
    </div>
  )
}