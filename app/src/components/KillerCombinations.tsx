import { useMemo } from 'react'
import { killerCombinations, type KillerCage } from '../domain/killerSudoku'
import { sudokuDigits } from '../domain/sudoku'

export function KillerCombinations({ cage, excluded, onToggle, onReset, disabled = false }: {
  cage: KillerCage; excluded: readonly number[]; onToggle: (mask: number) => void; onReset: () => void; disabled?: boolean
}) {
  const combinations = useMemo(() => killerCombinations(cage), [cage])
  return <section className="killer-combinations" aria-label="Cage combinations">
    <div className="killer-combinations-heading"><h2>{cage.sum} cage</h2><span>{cage.cells.length} {cage.cells.length === 1 ? 'cell' : 'cells'}</span></div>
    <p>All distinct-digit sets that add to {cage.sum}. Tap to cross one out or restore it.</p>
    <div className="killer-combinations-list" role="group" aria-label={`Combinations for a ${cage.sum} cage`}>
      {combinations.map(mask => {
        const label = sudokuDigits(mask).join(' + '), crossed = excluded.includes(mask)
        return <button key={mask} type="button" className="tool-button killer-combination" aria-label={`Cross out ${label}`}
          aria-pressed={crossed} disabled={disabled} onClick={() => onToggle(mask)}>{label}</button>
      })}
    </div>
    <p className="killer-combinations-count" role="status" aria-live="polite">{combinations.length - excluded.length} of {combinations.length} combinations not crossed out.</p>
    <button type="button" className="tool-button" onClick={onReset} disabled={disabled || excluded.length === 0}>Reset combinations</button>
    <p className="killer-combinations-note">Use the board to rule out sets. Your marks are personal notes; they don&rsquo;t change hints.</p>
  </section>
}
