import { type KeyboardEvent, type PointerEvent, useRef } from 'react'
import { SUDOKU_PEERS, sudokuCellName, sudokuDigits, type SudokuBoard as Board, type SudokuGame } from '../domain/sudoku'
import type { SudokuHint } from '../domain/sudokuHints'
import { isKillerSudokuBoard } from '../domain/killerSudoku'

export function SudokuBoard({ board, game, selected, selection, locked, conflicts, hint, instructionsId, onSelect, cageActive = false, cageFocus = selected }: {
  board: Board; game: SudokuGame; selected: number; selection: readonly number[]; locked: boolean; conflicts: ReadonlySet<number>
  hint: SudokuHint | null; instructionsId: string; cageActive?: boolean; cageFocus?: number; onSelect: (cell: number, extend?: boolean) => void
}) {
  const grid = useRef<HTMLDivElement>(null), support = new Set(hint?.support)
  const cages = isKillerSudokuBoard(board) ? board.cages : null
  const stroke = useRef<{ id: number; visited: Set<number> } | null>(null), focusing = useRef(false)
  const digit = selection.length === 1 ? game.cells[selected] : 0, matches = game.cells.flatMap((value, cell) => digit && value === digit ? [cell] : [])
  const matchingRows = new Set(matches.map(cell => Math.floor(cell / 9))), matchingColumns = new Set(matches.map(cell => cell % 9))
  const focus = (cell: number, preventScroll = false) => {
    focusing.current = true
    grid.current?.querySelector<HTMLElement>(`[data-cell="${cell}"]`)?.focus({ preventScroll })
    focusing.current = false
  }
  const finish = () => {
    const active = stroke.current
    stroke.current = null
    if (active && grid.current?.hasPointerCapture(active.id)) grid.current.releasePointerCapture(active.id)
  }
  const start = (event: PointerEvent<HTMLDivElement>) => {
    if (stroke.current) { if (event.pointerId !== stroke.current.id) finish(); return }
    if (locked || event.button !== 0 || event.ctrlKey || event.metaKey || event.isPrimary === false) return
    const target = (event.target as Element).closest<HTMLElement>('[data-cell]')
    if (!target) return
    event.preventDefault()
    const cell = Number(target.dataset['cell'])
    stroke.current = { id: event.pointerId, visited: new Set([cell]) }
    onSelect(cell, event.shiftKey); focus(cell, true)
    grid.current?.setPointerCapture(event.pointerId)
  }
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const active = stroke.current
    if (!active || active.id !== event.pointerId || locked) return
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-cell]')
    if (!target || !grid.current?.contains(target)) return
    const cell = Number(target.dataset['cell'])
    if (active.visited.has(cell)) return
    active.visited.add(cell); onSelect(cell, true); focus(cell, true)
  }
  const navigate = (event: KeyboardEvent<HTMLDivElement>) => {
    const r = Math.floor(selected / 9), c = selected % 9
    const moves: Record<string, number> = { ArrowUp: Math.max(0, r - 1) * 9 + c, ArrowDown: Math.min(8, r + 1) * 9 + c,
      ArrowLeft: r * 9 + Math.max(0, c - 1), ArrowRight: r * 9 + Math.min(8, c + 1), Home: r * 9, End: r * 9 + 8 }
    const cell = moves[event.key]
    if (cell !== undefined) { event.preventDefault(); onSelect(cell, event.shiftKey); focus(cell) }
  }
  return <div ref={grid} className="sudoku-board" role="grid" aria-label={cages ? '9 by 9 Killer Sudoku puzzle' : '9 by 9 Sudoku puzzle'} aria-multiselectable="true" aria-describedby={instructionsId} onKeyDown={navigate}
    onPointerDown={start} onPointerMove={move}
    onPointerUp={event => { if (stroke.current?.id === event.pointerId) finish() }}
    onPointerCancel={event => { if (stroke.current?.id === event.pointerId) finish() }}
    onLostPointerCapture={event => { if (event.target === event.currentTarget && stroke.current?.id === event.pointerId) finish() }}>
    {Array.from({ length: 9 }, (_, r) => <div role="row" className="sudoku-row" key={r}>
      {Array.from({ length: 9 }, (_, c) => {
        const cell = r * 9 + c, value = game.cells[cell]!, given = board.givens[cell] !== 0, notes = sudokuDigits(game.notes[cell]!)
        const cage = cages?.find(entry => entry.cells.includes(cell)), clue = cage && cell === Math.min(...cage.cells)
        return <button key={cell} type="button" role="gridcell" className="sudoku-cell" tabIndex={selected === cell ? 0 : -1}
          data-cell={cell} data-given={given} data-cage-clue={!!clue} data-cage-selected={cageActive && !!cage?.cells.includes(cageFocus)} data-selected={selection.includes(cell)} data-context={selection.length === 1 && SUDOKU_PEERS[selected]!.includes(cell)}
          data-match={!!digit && value === digit} data-digit-line={matchingRows.has(r) || matchingColumns.has(c)}
          data-conflict={conflicts.has(cell)} data-box-right={c === 2 || c === 5} data-box-bottom={r === 2 || r === 5}
          data-hint={hint?.cell === cell ? 'target' : support.has(cell) ? 'support' : undefined}
          aria-selected={selection.includes(cell)} aria-readonly={given || locked}
          aria-label={`${sudokuCellName(cell)}, ${value || 'Empty'}${given ? ', given' : ''}${cage ? `, cage total ${cage.sum}, cells ${cage.cells.map(sudokuCellName).join('; ')}` : ''}${notes.length ? `, notes ${notes.join(', ')}` : ''}${conflicts.has(cell) ? ', conflict' : ''}${hint?.cell === cell ? ', hint target' : support.has(cell) ? ', supports hint' : ''}`}
          onFocus={() => { if (!stroke.current && !focusing.current) onSelect(cell) }} onClick={event => { if (event.detail === 0) onSelect(cell, event.shiftKey) }}>
          {cage && <span className="killer-cage" aria-hidden="true" data-top={r === 0 || !cage.cells.includes(cell - 9)} data-right={c === 8 || !cage.cells.includes(cell + 1)} data-bottom={r === 8 || !cage.cells.includes(cell + 9)} data-left={c === 0 || !cage.cells.includes(cell - 1)} />}
          {clue && <span className="killer-sum" aria-hidden="true">{cage!.sum}</span>}
          {value ? <span className="sudoku-value">{value}</span> : <span className="sudoku-notes" aria-hidden="true">{Array.from({ length: 3 }, (_, row) =>
            <span className="sudoku-notes-row" key={row}>{Array.from({ length: 3 }, (_, col) => {
              const digit = row * 3 + col + 1
              return <span key={digit}>{notes.includes(digit) ? digit : ''}</span>
            })}</span>)}</span>}
        </button>
      })}
    </div>)}
  </div>
}
