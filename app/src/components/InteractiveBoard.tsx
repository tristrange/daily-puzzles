import { useState, type KeyboardEvent } from 'react'
import type { Board } from '../domain/board'
import type { GameState } from '../domain/game'
import { cellState } from '../domain/game'
import type { Hint } from '../domain/hints'

/**
 * Region colours, laid out to stay distinguishable on both light and dark
 * backgrounds. Region ids are dense (0..regionCount-1) and regionCount <= 16,
 * so each region maps to a stable colour. The palette is shared with `board.ts`
 * consumers and is tuned for the overlay markers to stay readable on top.
 */
const REGION_COLORS = [
  '#e76f51',
  '#f4a261',
  '#e9c46a',
  '#2a9d8f',
  '#264653',
  '#8ecae6',
  '#219ebc',
  '#023047',
  '#ffb703',
  '#fb8500',
  '#6d597a',
  '#b56576',
  '#eaac8b',
  '#a4c3b2',
  '#cc8b86',
  '#7f9cf5',
] as const

const PALETTE_SIZE = REGION_COLORS.length

/**
 * The playable board: a semantic ARIA grid a keyboard user can drive end to
 * end. The focused cell uses a roving tabindex (exactly one cell is in the
 * tab order), and the arrow keys move the focus. Enter/Space place or take
 * back a queen, X toggles an X mark, Delete/Backspace clears the cell and H
 * asks for a hint. Screen-reader users get a per-cell label describing the
 * position and contents; longer announcements (hint text, conflict warnings)
 * live in a visually hidden `aria-live` region owned by the puzzle view.
 */

export interface CellActionProps {
  board: Board
  game: GameState
  hint: Hint | null
  conflictCells: ReadonlySet<number>
  onToggleQueen: (cell: number) => void
  onToggleMark: (cell: number) => void
  onClear: (cell: number) => void
  onRequestHint: () => void
}

export function InteractiveBoard({
  board,
  game,
  hint,
  conflictCells,
  onToggleQueen,
  onToggleMark,
  onClear,
  onRequestHint,
}: CellActionProps) {
  const [focusIndex, setFocusIndex] = useState(0)

  const moveFocus = (cell: number) => {
    setFocusIndex(Math.max(0, Math.min(board.cellCount - 1, cell)))
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
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

  const labelFor = (cell: number): string => {
    const { row, col } = board.coords(cell)
    const position = `Row ${row + 1}, column ${col + 1}`
    const contents =
      cellState(game, cell) === 'queen'
        ? 'queen'
        : cellState(game, cell) === 'mark'
          ? 'marked'
          : 'empty'
    const conflict = conflictCells.has(cell) ? ', conflicting queen' : ''
    return `${position}, ${contents}${conflict}`
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
      aria-label={labelFor(cell)}
      className={classNameFor(cell)}
      style={{ backgroundColor: REGION_COLORS[region % PALETTE_SIZE] }}
      tabIndex={cell === focusIndex ? 0 : -1}
      onClick={() => onToggleQueen(cell)}
      onContextMenu={(event) => {
        event.preventDefault()
        onToggleMark(cell)
      }}
      onFocus={() => setFocusIndex(cell)}
    >
      {cellState(game, cell) === 'queen' && (
        <span className="marker" aria-hidden="true">
          ♛
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
      className="board playable"
      role="grid"
      aria-label={`${board.size} by ${board.size} queens puzzle with ${board.regionCount} regions`}
      style={{ gridTemplateColumns: `repeat(${board.size}, 1fr)` }}
      onKeyDown={onKeyDown}
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