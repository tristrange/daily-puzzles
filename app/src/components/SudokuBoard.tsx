import { type KeyboardEvent, useRef } from 'react'
import { SUDOKU_PEERS, sudokuCellName, sudokuDigits, type SudokuBoard as Board, type SudokuGame } from '../domain/sudoku'
import type { SudokuHint } from '../domain/sudokuHints'

export function SudokuBoard({ board, game, selected, locked, conflicts, hint, instructionsId, onSelect }: {
  board: Board; game: SudokuGame; selected: number; locked: boolean; conflicts: ReadonlySet<number>
  hint: SudokuHint | null; instructionsId: string; onSelect: (cell: number) => void
}) {
  const grid = useRef<HTMLDivElement>(null), support = new Set(hint?.support)
  const navigate = (event: KeyboardEvent<HTMLDivElement>) => {
    const r = Math.floor(selected / 9), c = selected % 9
    const moves: Record<string, number> = { ArrowUp: Math.max(0, r - 1) * 9 + c, ArrowDown: Math.min(8, r + 1) * 9 + c,
      ArrowLeft: r * 9 + Math.max(0, c - 1), ArrowRight: r * 9 + Math.min(8, c + 1), Home: r * 9, End: r * 9 + 8 }
    const cell = moves[event.key]
    if (cell !== undefined) { event.preventDefault(); grid.current?.querySelector<HTMLElement>(`[data-cell="${cell}"]`)?.focus() }
  }
  return <div ref={grid} className="sudoku-board" role="grid" aria-label="9 by 9 Sudoku puzzle" aria-describedby={instructionsId} onKeyDown={navigate}>
    {Array.from({ length: 9 }, (_, r) => <div role="row" className="sudoku-row" key={r}>
      {Array.from({ length: 9 }, (_, c) => {
        const cell = r * 9 + c, value = game.cells[cell]!, given = board.givens[cell] !== 0, notes = sudokuDigits(game.notes[cell]!)
        return <button key={cell} type="button" role="gridcell" className="sudoku-cell" tabIndex={selected === cell ? 0 : -1}
          data-cell={cell} data-given={given} data-selected={selected === cell} data-context={SUDOKU_PEERS[selected]!.includes(cell)}
          data-conflict={conflicts.has(cell)} data-box-right={c === 2 || c === 5} data-box-bottom={r === 2 || r === 5}
          data-hint={hint?.cell === cell ? 'target' : support.has(cell) ? 'support' : undefined}
          aria-selected={selected === cell} aria-readonly={given || locked}
          aria-label={`${sudokuCellName(cell)}, ${value || 'Empty'}${given ? ', given' : ''}${notes.length ? `, notes ${notes.join(', ')}` : ''}${conflicts.has(cell) ? ', conflict' : ''}${hint?.cell === cell ? ', hint target' : support.has(cell) ? ', supports hint' : ''}`}
          onFocus={() => onSelect(cell)} onClick={() => onSelect(cell)}>
          {value || <span className="sudoku-notes" aria-hidden="true">{Array.from({ length: 9 }, (_, i) => <span key={i}>{notes.includes(i + 1) ? i + 1 : ''}</span>)}</span>}
        </button>
      })}
    </div>)}
  </div>
}
