import { useRef, useState, type KeyboardEvent } from 'react'
import type { EnclosureGrid } from '../domain/enclosure'
import './Enclosure.css'

interface Props {
  grid: EnclosureGrid
  walls: readonly number[]
  reachable: readonly number[]
  enclosed: boolean
  instructionsId: string
  onToggle: (cell: number) => void
}

export function EnclosureBoard({ grid, walls, reachable, enclosed, instructionsId, onToggle }: Props) {
  const board = useRef<HTMLDivElement>(null)
  const [focus, setFocus] = useState(0)
  const navigate = (event: KeyboardEvent<HTMLDivElement>) => {
    const row = Math.floor(focus / grid.size), col = focus % grid.size
    const destinations: Record<string, number> = {
      ArrowUp: Math.max(0, row - 1) * grid.size + col,
      ArrowDown: Math.min(grid.size - 1, row + 1) * grid.size + col,
      ArrowLeft: row * grid.size + Math.max(0, col - 1),
      ArrowRight: row * grid.size + Math.min(grid.size - 1, col + 1),
      Home: row * grid.size,
      End: row * grid.size + grid.size - 1,
    }
    const destination = destinations[event.key]
    if (destination === undefined) return
    event.preventDefault()
    setFocus(destination)
    board.current?.querySelector<HTMLButtonElement>(`[data-cell="${destination}"]`)?.focus()
  }
  return <div ref={board} className="enclosure-board" role="grid" aria-label={`${grid.size} by ${grid.size} Horse Enclosure board`} aria-describedby={instructionsId} data-enclosed={enclosed} onKeyDown={navigate}>
    {Array.from({ length: grid.size }, (_, row) => <div className="enclosure-row" role="row" key={row}>
      {Array.from({ length: grid.size }, (_, col) => {
        const cell = row * grid.size + col
        const terrain = cell === grid.horse ? 'horse' : grid.water.includes(cell) ? 'water' : 'grass'
        const wall = walls.includes(cell), isReachable = reachable.includes(cell), fixed = terrain !== 'grass'
        const description = `${terrain}${wall ? ', wall' : ''}${isReachable ? `, reachable${enclosed ? ', enclosed' : ''}` : ''}`
        return <button key={cell} type="button" role="gridcell" className="enclosure-cell" data-cell={cell} data-terrain={terrain} data-wall={wall} data-reachable={isReachable}
          tabIndex={cell === focus ? 0 : -1} aria-readonly={fixed} aria-label={`Row ${row + 1}, column ${col + 1}, ${description}`}
          onFocus={() => setFocus(cell)} onClick={() => { if (!fixed) onToggle(cell) }}>
          {terrain === 'horse' && <svg className="enclosure-horse" viewBox="0 0 32 32" aria-hidden="true"><path d="M7 26h19l-2-4-4-2 2-5-3-7-4 2-3-4-2 7-3 3 4 3-2 3z" fill="currentColor"/><circle cx="16" cy="13" r="1" fill="var(--surface)"/></svg>}
          {terrain === 'water' && <span className="enclosure-water-mark" aria-hidden="true">≈</span>}
          {wall && <span className="enclosure-wall-mark" aria-hidden="true" />}
        </button>
      })}
    </div>)}
  </div>
}
