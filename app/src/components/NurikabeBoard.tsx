import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { NURIKABE_NAMES, type NurikabeBoard as Board, type NurikabeGame, type NurikabeMark } from '../domain/nurikabe'
import { historyCommand } from '../lib/useMoveHistory'

interface Props {
  board: Board; game: NurikabeGame; brush: NurikabeMark; locked: boolean; conflicts: ReadonlySet<number>; instructionsId: string
  onBegin: () => void; onApply: (cell: number, value: NurikabeMark) => void; onEnd: (cancel: boolean) => void
  onUndo: () => void; onRedo: () => void
}

export function NurikabeBoard({ board, game, brush, locked, conflicts, instructionsId, onBegin, onApply, onEnd, onUndo, onRedo }: Props) {
  const grid = useRef<HTMLDivElement>(null)
  const [focus, setFocus] = useState(0)
  const stroke = useRef<{ id: number; value: NurikabeMark; visited: Set<number> } | null>(null)
  const cellAt = (x: number, y: number) => {
    const element = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-cell]')
    return element && grid.current?.contains(element) ? Number(element.dataset['cell']) : null
  }
  const finish = (cancel: boolean) => {
    const active = stroke.current
    if (!active) return
    stroke.current = null
    if (grid.current?.hasPointerCapture(active.id)) grid.current.releasePointerCapture(active.id)
    onEnd(cancel)
  }
  const start = (event: PointerEvent<HTMLDivElement>) => {
    if ((stroke.current && event.pointerId !== stroke.current.id) || (event.pointerType === 'touch' && !event.isPrimary)) { finish(true); return }
    if (locked || event.button !== 0 || event.ctrlKey) return
    const cell = cellAt(event.clientX, event.clientY)
    if (cell === null) return
    event.preventDefault()
    setFocus(cell)
    grid.current?.querySelector<HTMLElement>(`[data-cell="${cell}"]`)?.focus({ preventScroll: true })
    if (board.clues[cell] !== 0) return
    stroke.current = { id: event.pointerId, value: game[cell] === brush ? 0 : brush, visited: new Set([cell]) }
    onBegin(); onApply(cell, stroke.current.value)
    grid.current?.setPointerCapture(event.pointerId)
  }
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const active = stroke.current
    if (!active || active.id !== event.pointerId || locked) return
    const cell = cellAt(event.clientX, event.clientY)
    if (cell === null || active.visited.has(cell)) return
    active.visited.add(cell); onApply(cell, active.value)
  }
  const one = (cell: number, value: NurikabeMark) => {
    if (locked || stroke.current || board.clues[cell] !== 0) return
    onBegin(); onApply(cell, game[cell] === value ? 0 : value); onEnd(false)
  }
  const key = (event: KeyboardEvent<HTMLDivElement>) => {
    const size = board.size, row = Math.floor(focus / size), col = focus % size
    const navigation: Record<string, number> = { ArrowUp: Math.max(0, row - 1) * size + col,
      ArrowDown: Math.min(size - 1, row + 1) * size + col, ArrowLeft: row * size + Math.max(0, col - 1),
      ArrowRight: row * size + Math.min(size - 1, col + 1), Home: row * size, End: row * size + size - 1 }
    const destination = navigation[event.key]
    if (destination !== undefined) {
      event.preventDefault(); finish(true); setFocus(destination)
      grid.current?.querySelector<HTMLElement>(`[data-cell="${destination}"]`)?.focus()
      return
    }
    if (locked) return
    const command = historyCommand(event)
    if (command) { event.preventDefault(); finish(true); if (command === 'undo') onUndo(); else onRedo(); return }
    if (event.ctrlKey || event.metaKey || event.altKey) return
    const pressed = event.key.toLowerCase()
    if (['1', '2', '0', 's', 'l', 'delete', 'backspace', 'enter', ' '].includes(pressed)) {
      event.preventDefault(); finish(true)
      one(focus, ['1', 's'].includes(pressed) ? 1 : ['2', 'l'].includes(pressed) ? 2 : ['enter', ' '].includes(pressed) ? brush : 0)
    }
  }
  return <div ref={grid} className="nurikabe-board" role="grid" aria-label={`${board.size} by ${board.size} Nurikabe puzzle`} aria-describedby={instructionsId}
    onKeyDown={key} onPointerDown={start} onPointerMove={move}
    onPointerUp={event => { if (stroke.current?.id === event.pointerId) finish(false) }}
    onPointerCancel={event => { if (stroke.current?.id === event.pointerId) finish(true) }}
    onLostPointerCapture={event => { if (event.target === event.currentTarget && stroke.current?.id === event.pointerId) finish(true) }}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) finish(true) }}>
    {Array.from({ length: board.size }, (_, row) => <div role="row" className="nurikabe-row" key={row}>
      {Array.from({ length: board.size }, (_, col) => {
        const cell = row * board.size + col, clue = board.clues[cell] ?? 0, mark = game[cell] ?? 0
        return <button className="nurikabe-cell" type="button" role="gridcell" key={cell} data-cell={cell} data-mark={mark}
          data-clue={clue > 0} data-conflict={conflicts.has(cell)} tabIndex={cell === focus ? 0 : -1}
          aria-readonly={clue > 0 || locked} aria-label={`Row ${row + 1}, column ${col + 1}, ${clue > 0 ? `Island ${clue}, fixed land` : NURIKABE_NAMES[mark]}${conflicts.has(cell) ? ', conflict' : ''}`}
          onFocus={() => setFocus(cell)} onClick={event => { if (event.detail === 0) one(cell, brush) }}
          onContextMenu={event => { event.preventDefault(); finish(true); one(cell, 0) }}>
          {clue > 0 ? clue : mark === 2 ? <span className="nurikabe-land-dot" aria-hidden="true" /> : null}
        </button>
      })}
    </div>)}
  </div>
}
