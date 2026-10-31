import { useEffect, useEffectEvent, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { relationBroken, TRIO_NAMES, trioAction, type TrioAction, type TrioBoard as Board, type TrioGame, type TrioSymbol as SymbolValue, type TrioValue } from '../domain/trio'
import { historyCommand } from '../lib/useMoveHistory'
import { TrioSymbol } from './TrioSymbol'
import type { TrioHint } from '../domain/trioHints'

export const TRIO_NOTE_TAP_MS = 500
const TAP_SLOP = 12

export interface TrioNoteTap { cell: number; symbol: SymbolValue; before: TrioGame; after: TrioGame }
export type TrioNoteGesture = { kind: 'single'; cell: number; symbol: SymbolValue } | { kind: 'double'; first: TrioNoteTap }
type PreviousTap = TrioNoteTap & { at: number; pointerType: string; brush: TrioValue; pencil: boolean }

interface Props {
  board: Board; game: TrioGame; brush: TrioValue; pencil: boolean; locked: boolean
  conflicts: ReadonlySet<number>; instructionsId: string
  hint?: TrioHint | null
  inspection?: { selected: number | null; onSelect: (cell: number) => void }
  noteShortcut?: boolean; onInterrupt?: () => void
  onApply: (cell: number, action: TrioAction) => void
  onBegin: (repeat?: TrioNoteTap) => boolean | void; onEnd: (cancel: boolean, gesture?: TrioNoteGesture) => TrioGame | void
  onUndo: () => void; onRedo: () => void; onPencil: () => void
}

export function TrioBoard({ board, game, brush, pencil, locked, conflicts, instructionsId, hint, inspection, noteShortcut = false, onInterrupt, onApply, onBegin, onEnd, onUndo, onRedo, onPencil }: Props) {
  const grid = useRef<HTMLDivElement>(null)
  const [focus, setFocus] = useState(() => Math.max(0, board.givens.indexOf(0)))
  const stroke = useRef<{ id: number; action: TrioAction; visited: Set<number>; cell: number; before: TrioGame; symbol: SymbolValue | null
    repeat: PreviousTap | null; brush: TrioValue; pencil: boolean; x: number; y: number; started: number; pointerType: string; tap: boolean } | null>(null)
  const previousTap = useRef<PreviousTap | null>(null)
  const support = new Set(hint?.steps.flatMap((step) => [...step.group]))
  const interruptOutside = useEffectEvent(() => onInterrupt?.())
  useEffect(() => {
    if (grid.current?.contains(document.activeElement)) grid.current.querySelector<HTMLElement>(`[data-cell="${focus}"]`)?.focus()
  }, [focus])
  useEffect(() => {
    if (!noteShortcut) return
    const outside = (event: globalThis.PointerEvent) => {
      if (!(event.target instanceof Node) || !grid.current?.contains(event.target)) { previousTap.current = null; interruptOutside() }
    }
    document.addEventListener('pointerdown', outside, true)
    return () => document.removeEventListener('pointerdown', outside, true)
  }, [noteShortcut])

  const cellAt = (x: number, y: number): number | null => {
    const element = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-cell]')
    return element && grid.current?.contains(element) ? Number(element.dataset['cell']) : null
  }
  const finish = (cancel: boolean, event?: PointerEvent<HTMLDivElement>) => {
    const active = stroke.current
    if (!active) return
    stroke.current = null
    if (grid.current?.hasPointerCapture(active.id)) grid.current.releasePointerCapture(active.id)
    if (cancel || !event) { previousTap.current = null; onEnd(true); return }
    const now = event.timeStamp, target = cellAt(event.clientX, event.clientY)
    const tap = active.tap && active.visited.size === 1 && now - active.started <= TRIO_NOTE_TAP_MS && target === active.cell
      && Math.hypot(event.clientX - active.x, event.clientY - active.y) <= TAP_SLOP && !event.shiftKey && !event.altKey
    const repeat = tap && active.repeat && now - active.repeat.at <= TRIO_NOTE_TAP_MS ? active.repeat : null
    const gesture: TrioNoteGesture | undefined = repeat ? { kind: 'double', first: repeat }
      : tap && active.symbol ? { kind: 'single', cell: active.cell, symbol: active.symbol } : undefined
    const after = onEnd(false, gesture)
    previousTap.current = gesture?.kind === 'single' && after
      ? { cell: active.cell, symbol: gesture.symbol, before: active.before, after, at: now, pointerType: active.pointerType, brush: active.brush, pencil: active.pencil } : null
  }
  const start = (event: PointerEvent<HTMLDivElement>) => {
    if (stroke.current) { if (event.pointerId !== stroke.current.id) finish(true); return }
    if (event.button !== 0 || event.ctrlKey) { previousTap.current = null; onInterrupt?.(); return }
    if (locked) {
      if (!inspection) return
      const cell = cellAt(event.clientX, event.clientY)
      if (cell !== null) { setFocus(cell); inspection.onSelect(cell); grid.current?.querySelector<HTMLElement>(`[data-cell="${cell}"]`)?.focus({ preventScroll: true }) }
      return
    }
    const cell = cellAt(event.clientX, event.clientY)
    if (cell === null) { previousTap.current = null; onInterrupt?.(); return }
    if (board.givens[cell] !== 0) {
      previousTap.current = null; onInterrupt?.()
      if (inspection) { setFocus(cell); inspection.onSelect(cell); grid.current?.querySelector<HTMLElement>(`[data-cell="${cell}"]`)?.focus({ preventScroll: true }) }
      return
    }
    const prior = previousTap.current
    previousTap.current = null
    const tap = noteShortcut && !event.shiftKey && !event.altKey && !event.metaKey && event.isPrimary !== false
    const repeat = tap && prior && prior.cell === cell && prior.pointerType === event.pointerType
      && prior.brush === brush && prior.pencil === pencil && event.timeStamp - prior.at <= TRIO_NOTE_TAP_MS && game === prior.after ? prior : null
    if (onBegin(repeat ?? undefined) === false) return
    setFocus(cell)
    inspection?.onSelect(cell)
    grid.current?.querySelector<HTMLElement>(`[data-cell="${cell}"]`)?.focus({ preventScroll: true })
    const mask = game.cells[cell] === 0 ? game.notes[cell] : 0
    const symbol = mask === 1 ? 1 : mask === 2 ? 2 : mask === 4 ? 3 : null
    stroke.current = { id: event.pointerId, action: trioAction(game, cell, brush, pencil), visited: new Set([cell]), cell,
      before: game, symbol, repeat, brush, pencil, x: event.clientX, y: event.clientY, started: event.timeStamp, pointerType: event.pointerType, tap }
    onApply(cell, stroke.current.action)
    grid.current?.setPointerCapture(event.pointerId)
  }
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const active = stroke.current
    if (!active || active.id !== event.pointerId || locked) return
    if (Math.hypot(event.clientX - active.x, event.clientY - active.y) > TAP_SLOP) active.tap = false
    const cell = cellAt(event.clientX, event.clientY)
    if (cell === null || active.visited.has(cell)) return
    active.visited.add(cell)
    if (inspection) { setFocus(cell); inspection.onSelect(cell) }
    onApply(cell, active.action)
  }
  const one = (cell: number, value: TrioValue) => {
    if (locked || stroke.current || onBegin() === false) return
    inspection?.onSelect(cell); onApply(cell, trioAction(game, cell, value, pencil)); onEnd(false)
  }
  const key = (event: KeyboardEvent<HTMLDivElement>) => {
    previousTap.current = null; onInterrupt?.()
    const row = Math.floor(focus / 9), col = focus % 9
    const navigation: Record<string, number> = { ArrowUp: Math.max(0, row - 1) * 9 + col, ArrowDown: Math.min(8, row + 1) * 9 + col,
      ArrowLeft: row * 9 + Math.max(0, col - 1), ArrowRight: row * 9 + Math.min(8, col + 1), Home: row * 9, End: row * 9 + 8 }
    if (navigation[event.key] !== undefined) { event.preventDefault(); setFocus(navigation[event.key]!); inspection?.onSelect(navigation[event.key]!); return }
    if (locked) { if (inspection && ['Enter', ' '].includes(event.key)) { event.preventDefault(); inspection.onSelect(focus) } return }
    const command = historyCommand(event)
    if (command) { event.preventDefault(); finish(true); if (command === 'undo') onUndo(); else onRedo(); return }
    if (event.ctrlKey || event.metaKey || event.altKey) return
    if (event.key.toLowerCase() === 'n') { event.preventDefault(); onPencil(); return }
    if (['1', '2', '3', '0', 'Delete', 'Backspace', 'Enter', ' '].includes(event.key)) {
      event.preventDefault()
      const value: TrioValue = event.key === '1' ? 1 : event.key === '2' ? 2 : event.key === '3' ? 3 : ['Enter', ' '].includes(event.key) ? brush : 0
      one(focus, value)
    }
  }
  return <div ref={grid} role="grid" aria-label="9 by 9 Trio puzzle" aria-describedby={instructionsId} className="trio-board"
    onKeyDown={key} onPointerDown={start} onPointerMove={move}
    onPointerUp={(event) => { if (stroke.current?.id === event.pointerId) finish(false, event) }}
    onPointerCancel={(event) => { if (stroke.current?.id === event.pointerId) finish(true) }}
    onLostPointerCapture={(event) => { if (event.target === event.currentTarget && stroke.current?.id === event.pointerId) finish(true) }}
    onBlur={event => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) { previousTap.current = null; onInterrupt?.() } }}>
    {Array.from({ length: 9 }, (_, row) => <div role="row" className="trio-row" key={row}>
      {Array.from({ length: 9 }, (_, col) => {
        const cell = row * 9 + col, value = game.cells[cell]!, notes = game.notes[cell]!, given = board.givens[cell] !== 0
        const edges = board.relations.filter((edge) => edge.first === cell)
        const neighbours = board.relations.filter((edge) => edge.first === cell || edge.second === cell).map((edge) => {
          const other = edge.first === cell ? edge.second : edge.first
          return `${edge.kind === 'same' ? 'same as' : 'different from'} row ${Math.floor(other / 9) + 1} column ${other % 9 + 1}`
        })
        const noteLabel = [1, 2, 3].filter((v) => notes & (1 << (v - 1))).map((v) => TRIO_NAMES[v as SymbolValue]).join(', ')
        return <div role="presentation" className="trio-cell-wrap" key={cell}>
          <button role="gridcell" type="button" className="trio-cell" data-cell={cell} data-given={given} data-conflict={conflicts.has(cell)}
            data-hint={hint?.cell === cell ? 'target' : support.has(cell) ? 'support' : undefined}
            data-selected={inspection?.selected === cell ? true : undefined} aria-selected={inspection ? inspection.selected === cell : undefined}
            tabIndex={focus === cell ? 0 : -1} aria-readonly={given || locked}
            aria-label={`Row ${row + 1}, column ${col + 1}, ${TRIO_NAMES[value]}${given ? ', given' : ''}${noteLabel ? `, notes ${noteLabel}` : ''}${conflicts.has(cell) ? ', conflict' : ''}${hint?.cell === cell ? ', hint target' : support.has(cell) ? ', supports hint' : ''}${neighbours.length ? `; ${neighbours.join('; ')}` : ''}`}
            onFocus={() => { setFocus(cell); if (!locked) inspection?.onSelect(cell) }} onClick={(event) => { if (event.detail === 0) { if (inspection) { setFocus(cell); inspection.onSelect(cell) } if (!locked) one(cell, brush) } }}
            onContextMenu={(event) => { event.preventDefault(); one(cell, 0) }}>
            {value !== 0 ? <TrioSymbol value={value} /> : <span className="trio-notes" aria-hidden="true">{([1, 2, 3] as const).map((v) => <span key={v}>{notes & (1 << (v - 1)) ? <TrioSymbol value={v} /> : null}</span>)}</span>}
          </button>
          {edges.map((edge) => <span key={edge.second} aria-hidden="true" data-conflict={relationBroken(game.cells, edge)}
            className={`trio-relation ${edge.second === cell + 1 ? 'trio-relation-right' : 'trio-relation-down'}`}>{edge.kind === 'same' ? '=' : '×'}</span>)}
        </div>
      })}
    </div>)}
  </div>
}
