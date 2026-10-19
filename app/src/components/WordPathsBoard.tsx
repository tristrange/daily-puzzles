import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { historyCommand } from '../lib/useMoveHistory'
import { spellPath, type WordGame } from '../domain/wordGame'

export interface WordPathsBoardProps {
  game: WordGame
  locked?: boolean
  instructionsId: string
  onSelect: (cell: number) => readonly number[]
  onRestoreTrace: (path: readonly number[]) => void
  onSubmit: () => void
  onUndo: () => void
  onRedo: () => void
}

export function WordPathsBoard({ game, locked = false, instructionsId, onSelect, onRestoreTrace, onSubmit, onUndo, onRedo }: WordPathsBoardProps) {
  const { grid } = game
  const board = useRef<HTMLDivElement>(null)
  const [focus, setFocus] = useState(() => grid.letters.findIndex((letter) => letter !== null))
  const stroke = useRef<{
    id: number; first: number; x: number; y: number; dragged: boolean;
    before: readonly number[]; path: readonly number[]
  } | null>(null)

  useEffect(() => {
    if (board.current?.contains(document.activeElement)) {
      board.current.querySelector<HTMLElement>(`[data-cell="${focus}"]`)?.focus()
    }
  }, [focus])

  const cellAt = (x: number, y: number): number | null => {
    const element = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-cell]')
    if (!element || !board.current?.contains(element)) return null
    const cell = Number(element.dataset['cell'])
    return Number.isInteger(cell) ? cell : null
  }
  const cancel = () => {
    const active = stroke.current
    if (!active) return
    stroke.current = null
    onRestoreTrace(active.before)
    if (board.current?.hasPointerCapture(active.id)) board.current.releasePointerCapture(active.id)
  }
  const down = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary || stroke.current !== null) { cancel(); return }
    if (locked || event.button !== 0 || event.ctrlKey) return
    const cell = cellAt(event.clientX, event.clientY)
    if (cell === null || grid.letters[cell] === null || game.words.some((path) => path.includes(cell))) return
    const before = game.trace
    const path = onSelect(cell)
    stroke.current = { id: event.pointerId, first: cell, x: event.clientX, y: event.clientY, dragged: false, before, path }
    event.currentTarget.setPointerCapture(event.pointerId)
    setFocus(cell)
    board.current?.querySelector<HTMLElement>(`[data-cell="${cell}"]`)?.focus({ preventScroll: true })
  }
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const active = stroke.current
    if (!active || locked || event.pointerId !== active.id) return
    if (Math.hypot(event.clientX - active.x, event.clientY - active.y) >= 8) active.dragged = true
    const cell = cellAt(event.clientX, event.clientY)
    if (cell === null) return
    const path = onSelect(cell)
    if (path.at(-1) !== active.path.at(-1)) active.dragged = true
    active.path = path
  }
  const up = (event: PointerEvent<HTMLDivElement>) => {
    const active = stroke.current
    if (!active || event.pointerId !== active.id) return
    const cell = cellAt(event.clientX, event.clientY)
    if (cell === null || cell !== active.path.at(-1) || (!active.dragged && cell !== active.first)) {
      cancel(); return
    }
    stroke.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (active.dragged && !locked) onSubmit()
  }
  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const command = historyCommand(event)
    if (command) {
      event.preventDefault(); cancel()
      if (!locked) { if (command === 'undo') onUndo(); else onRedo() }
      return
    }
    const row = Math.floor(focus / grid.width), col = focus % grid.width
    let next = focus
    switch (event.key) {
      case 'ArrowUp': if (row > 0) next -= grid.width; break
      case 'ArrowDown': if (row < grid.height - 1) next += grid.width; break
      case 'ArrowLeft': if (col > 0) next--; break
      case 'ArrowRight': if (col < grid.width - 1) next++; break
      case 'Home': next = row * grid.width; break
      case 'End': next = row * grid.width + grid.width - 1; break
      case 'Escape': cancel(); if (!locked) onRestoreTrace([]); break
      case 'Backspace': if (!locked) { cancel(); onRestoreTrace(game.trace.slice(0, -1)) } break
      case ' ': if (!locked && !stroke.current) onSelect(focus); break
      case 'Enter': if (!locked && !stroke.current) onSubmit(); break
      default: return
    }
    event.preventDefault()
    setFocus(next)
  }

  return (
    <div ref={board} className="board playable word-board" role="grid" aria-label="Word Paths board"
      aria-rowcount={grid.height} aria-colcount={grid.width} aria-describedby={instructionsId}
      style={{ '--word-columns': grid.width } as CSSProperties}
      onPointerDown={down} onPointerMove={move} onPointerUp={up}
      onPointerCancel={(event) => { if (stroke.current?.id === event.pointerId) cancel() }}
      onLostPointerCapture={(event) => { if (stroke.current?.id === event.pointerId) cancel() }}
      onKeyDown={keyDown}>
      {Array.from({ length: grid.height }, (_, row) => (
        <div role="row" className="word-row" key={row}>
          {Array.from({ length: grid.width }, (_, col) => {
            const cell = row * grid.width + col
            const letter = grid.letters[cell]
            const accepted = game.words.find((path) => path.includes(cell))
            const selected = game.trace.indexOf(cell)
            const unavailable = locked || letter === null || accepted !== undefined
            const label = `Row ${row + 1}, column ${col + 1}, ${letter ?? 'blocked'}${selected >= 0 ? `, selected letter ${selected + 1}` : ''}${accepted ? `, accepted ${accepted.length}-letter word ${spellPath(grid, accepted)}` : ''}`
            return (
              <button key={cell} type="button" role="gridcell" data-cell={cell} data-length={accepted?.length}
                className={`word-cell${letter === null ? ' blocked' : ''}${selected >= 0 ? ' selected' : ''}${accepted ? ' accepted' : ''}`}
                tabIndex={focus === cell ? 0 : -1} aria-label={label} aria-selected={selected >= 0 || accepted !== undefined}
                aria-disabled={unavailable} onFocus={() => setFocus(cell)}
                onClick={(event) => { if (event.detail === 0 && !unavailable) onSelect(cell) }}>
                <span aria-hidden="true">{letter ?? ''}</span>
                {(selected >= 0 || accepted) && <small aria-hidden="true">{accepted?.length ?? selected + 1}</small>}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
