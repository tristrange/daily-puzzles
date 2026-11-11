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
          {terrain === 'horse' && <svg className="enclosure-horse" viewBox="0 0 64 64" fill="currentColor" aria-hidden="true">
            <path d="M15 24C20 21 29 22 34 23C34 18 37 13 41 11L42 8L46 12L48 10L49 14C51 17 56 18 59 21Q61 23 59 26L55 27L48 23C47 27 45 31 43 34L41 47L43 53H37L36 43L35 39C29 41 22 39 19 38L15 44L17 50L20 53H13L10 43L12 35C9 31 9 27 15 24Z" />
            <path d="M13 25C5 20 5 28 5 34Q5 40 1 43C9 41 11 34 10 29Q11 27 14 29ZM17 36L23 38L21 44L26 51V53H21L16 45ZM32 36L38 37L34 48L37 53H32L29 45Z" />
            <circle cx="49" cy="18" r="1.25" fill="var(--surface)" />
          </svg>}
          {terrain === 'water' && <span className="enclosure-water-mark" aria-hidden="true">≈</span>}
          {wall && <span className="enclosure-wall-mark" aria-hidden="true" />}
        </button>
      })}
    </div>)}
  </div>
}
