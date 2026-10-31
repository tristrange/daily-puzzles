import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react'
import { TENTS_NAMES, type TentsBoard as Board, type TentsGame, type TentsMark } from '../domain/tents'
import type { TentsHint } from '../domain/tentsHints'
import { historyCommand } from '../lib/useMoveHistory'
import { TentsSymbol } from './TentsSymbol'

interface Props {
  board: Board; game: TentsGame; brush: TentsMark | 'highlight'; locked: boolean; conflicts: ReadonlySet<number>
  hint: TentsHint | null; instructionsId: string
  onBegin: () => void; onApply: (cell: number, value: TentsMark) => void; onEnd: (cancel: boolean) => void
  onUndo: () => void; onRedo: () => void; onHint: () => void
  inspection?: { selected: number | null; onSelect: (cell: number) => void }
  selection?: { cells: readonly number[]; onSelect: (cell: number, mode: 'toggle' | 'add') => void }
}

export function TentsBoard({ board, game, brush, locked, conflicts, hint, instructionsId, onBegin, onApply, onEnd, onUndo, onRedo, onHint, inspection, selection }: Props) {
  const grid = useRef<HTMLDivElement>(null)
  const [focus, setFocus] = useState(0)
  const stroke = useRef<({ id: number; visited: Set<number> } & (
    | { kind: 'mark'; value: TentsMark }
    | { kind: 'highlight'; start: number; restoreStart: boolean }
  )) | null>(null)
  useEffect(() => {
    if (grid.current?.contains(document.activeElement)) grid.current.querySelector<HTMLElement>(`[data-cell="${focus}"]`)?.focus({ preventScroll: true })
  }, [focus])
  const cellAt = (x: number, y: number) => {
    const element = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-cell]')
    return element && grid.current?.contains(element) ? Number(element.dataset['cell']) : null
  }
  const finish = (cancel: boolean) => {
    const active = stroke.current
    if (!active) return
    stroke.current = null
    if (grid.current?.hasPointerCapture(active.id)) grid.current.releasePointerCapture(active.id)
    if (active.kind === 'mark') onEnd(cancel)
  }
  const start = (event: PointerEvent<HTMLDivElement>) => {
    if (stroke.current && event.pointerId !== stroke.current.id) { finish(true); return }
    if (event.button !== 0 || event.ctrlKey) return
    const cell = cellAt(event.clientX, event.clientY)
    if (cell === null) return
    if (locked) {
      if (inspection) { setFocus(cell); inspection.onSelect(cell); grid.current?.querySelector<HTMLElement>(`[data-cell="${cell}"]`)?.focus({ preventScroll: true }) }
      return
    }
    if (selection && (brush === 'highlight' || event.shiftKey)) {
      if (event.shiftKey && selection.cells.length === 0 && grid.current?.contains(document.activeElement)) selection.onSelect(focus, 'add')
      setFocus(cell)
      grid.current?.querySelector<HTMLElement>(`[data-cell="${cell}"]`)?.focus({ preventScroll: true })
      const wasSelected = selection.cells.includes(cell)
      selection.onSelect(cell, event.shiftKey ? 'add' : 'toggle')
      // A drag that starts on a highlighted cell must add the cells it crosses,
      // not leave the starting cell toggled off. Restore it on the first move.
      stroke.current = { id: event.pointerId, kind: 'highlight', visited: new Set([cell]), start: cell, restoreStart: !event.shiftKey && wasSelected }
      grid.current?.setPointerCapture(event.pointerId)
      return
    }
    if (brush === 'highlight' || board.trees.includes(cell)) return
    setFocus(cell)
    grid.current?.querySelector<HTMLElement>(`[data-cell="${cell}"]`)?.focus({ preventScroll: true })
    stroke.current = { id: event.pointerId, kind: 'mark', value: game[cell] === brush ? 0 : brush, visited: new Set([cell]) }
    onBegin(); onApply(cell, stroke.current.value)
    grid.current?.setPointerCapture(event.pointerId)
  }
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const active = stroke.current
    if (!active || active.id !== event.pointerId || locked) return
    const cell = cellAt(event.clientX, event.clientY)
    if (cell === null || active.visited.has(cell)) return
    active.visited.add(cell)
    if (active.kind === 'highlight') {
      if (active.restoreStart) {
        selection?.onSelect(active.start, 'add')
        active.restoreStart = false
      }
      selection?.onSelect(cell, 'add')
    } else onApply(cell, active.value)
  }
  const one = (cell: number, value: TentsMark) => {
    if (locked || stroke.current) return
    onBegin(); onApply(cell, game[cell] === value ? 0 : value); onEnd(false)
  }
  const key = (event: KeyboardEvent<HTMLDivElement>) => {
    const size = board.size, row = Math.floor(focus / size), col = focus % size
    const navigation: Record<string, number> = { ArrowUp: Math.max(0, row - 1) * size + col,
      ArrowDown: Math.min(size - 1, row + 1) * size + col, ArrowLeft: row * size + Math.max(0, col - 1),
      ArrowRight: row * size + Math.min(size - 1, col + 1), Home: row * size, End: row * size + size - 1 }
    if (navigation[event.key] !== undefined) {
      event.preventDefault(); setFocus(navigation[event.key]!); inspection?.onSelect(navigation[event.key]!)
      if (selection && !locked && event.shiftKey) {
        if (selection.cells.length === 0) selection.onSelect(focus, 'add')
        selection.onSelect(navigation[event.key]!, 'add')
      }
      return
    }
    if (locked) { if (inspection && ['Enter', ' '].includes(event.key)) { event.preventDefault(); inspection.onSelect(focus) } return }
    const command = historyCommand(event)
    if (command) { event.preventDefault(); finish(true); if (command === 'undo') onUndo(); else onRedo(); return }
    if (event.ctrlKey || event.metaKey || event.altKey) return
    if (event.key.toLowerCase() === 'h') { event.preventDefault(); onHint(); return }
    if (brush === 'highlight' && ['Enter', ' '].includes(event.key)) {
      event.preventDefault(); selection?.onSelect(focus, event.shiftKey ? 'add' : 'toggle'); return
    }
    if (['1', '2', '0', 't', 'T', 'g', 'G', 'Delete', 'Backspace', 'Enter', ' '].includes(event.key)) {
      event.preventDefault()
      one(focus, ['1', 't', 'T'].includes(event.key) ? 1 : ['2', 'g', 'G'].includes(event.key) ? 2 : ['Enter', ' '].includes(event.key) && brush !== 'highlight' ? brush : 0)
    }
  }
  const count = (cells: number[]) => cells.filter(cell => game[cell] === 1).length
  return <div className="tents-board-shell" style={{ '--tents-size': board.size } as CSSProperties}>
    <div className="tents-head" aria-hidden="true"><span />{board.colClues.map((clue, col) => {
      const actual = count(Array.from({ length: board.size }, (_, row) => row * board.size + col))
      return <span className="tents-clue" data-state={actual > clue ? 'error' : actual === clue ? 'met' : undefined} key={col}>{clue}</span>
    })}</div>
    <div ref={grid} className="tents-board" role="grid" aria-label={`${board.size} by ${board.size} Tents puzzle`} aria-describedby={instructionsId} aria-multiselectable={selection ? true : undefined} data-highlighting={brush === 'highlight' || undefined}
      onKeyDown={key} onPointerDown={start} onPointerMove={move}
      onPointerUp={event => { if (stroke.current?.id === event.pointerId) finish(false) }}
      onPointerCancel={event => { if (stroke.current?.id === event.pointerId) finish(true) }}
      onLostPointerCapture={event => { if (event.target === event.currentTarget && stroke.current?.id === event.pointerId) finish(true) }}>
      {board.rowClues.map((clue, row) => {
        const cells = Array.from({ length: board.size }, (_, col) => row * board.size + col), actual = count(cells)
        return <div className="tents-row" role="row" key={row}>
          <span className="tents-clue" role="presentation" aria-hidden="true" data-state={actual > clue ? 'error' : actual === clue ? 'met' : undefined}>{clue}</span>
          {cells.map(cell => {
            const tree = board.trees.includes(cell), mark = game[cell]!, support = hint?.support.includes(cell)
            return <button className="tents-cell" role="gridcell" type="button" key={cell} data-cell={cell}
              data-tree={tree} data-mark={mark} data-conflict={conflicts.has(cell)}
              data-hint={hint?.cell === cell ? 'target' : support ? 'support' : undefined}
              data-selected={inspection?.selected === cell || selection?.cells.includes(cell) ? true : undefined} aria-selected={inspection ? inspection.selected === cell : selection ? selection.cells.includes(cell) : undefined}
              tabIndex={cell === focus ? 0 : -1} aria-readonly={tree || locked} onFocus={() => setFocus(cell)}
              aria-label={`Row ${row + 1}, column ${cell % board.size + 1}, ${tree ? 'Tree, fixed' : TENTS_NAMES[mark]}, row needs ${clue}, column needs ${board.colClues[cell % board.size]}${conflicts.has(cell) ? ', conflict' : ''}${hint?.cell === cell ? ', hint target' : support ? ', supports hint' : ''}`}
              onClick={event => { if (event.detail === 0) { if (inspection) inspection.onSelect(cell); else if (selection && (brush === 'highlight' || event.shiftKey)) selection.onSelect(cell, event.shiftKey ? 'add' : 'toggle'); else if (brush !== 'highlight') one(cell, brush) } }} onContextMenu={event => { event.preventDefault(); if (brush !== 'highlight' && !event.shiftKey) one(cell, 0) }}>
              {(tree || mark !== 0) && <TentsSymbol kind={tree ? 'tree' : mark === 1 ? 'tent' : 'grass'} />}
            </button>
          })}
        </div>
      })}
    </div>
  </div>
}
