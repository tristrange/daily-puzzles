import type { Puzzle } from '../domain/puzzle'

/**
 * Region colours, laid out to stay distinguishable on both light and dark
 * backgrounds. Region ids are dense (0..regionCount-1) and regionCount <= 16,
 * so each region maps to a stable colour. This is a shell-time render; the
 * interactive board, queens, borders and auto-marking land in M6.
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

export function PuzzleBoard({ puzzle }: { puzzle: Puzzle }) {
  return (
    <div
      className="board"
      style={{ gridTemplateColumns: `repeat(${puzzle.size}, 1fr)` }}
      role="img"
      aria-label={`${puzzle.size} by ${puzzle.size} queens puzzle with ${puzzle.board.regionCount} regions`}
    >
      {puzzle.board.regions.map((region, index) => (
        <div
          className="cell"
          key={index}
          style={{ backgroundColor: REGION_COLORS[region % PALETTE_SIZE] }}
        />
      ))}
    </div>
  )
}