import { useMemo } from 'react'
import { killerCombinations, type KillerCage } from '../domain/killerSudoku'
import { sudokuDigits } from '../domain/sudoku'

export function KillerCombinations({ cage, excluded, onToggle, onReset, onClose, disabled = false }: {
  cage: KillerCage; excluded: readonly number[]; onToggle: (mask: number) => void; onReset: () => void; onClose?: () => void; disabled?: boolean
}) {
  const combinations = useMemo(() => killerCombinations(cage), [cage])
  return <section className="killer-combinations" aria-label="Cage combinations">
    <div className="killer-combinations-heading"><h2>{cage.sum} cage</h2><span>{cage.cells.length} {cage.cells.length === 1 ? 'cell' : 'cells'}</span></div>
    <p>Tap a set to cross it out or restore it.</p>
    <div className="killer-combinations-list" role="group" aria-label={`Combinations for a ${cage.sum} cage`}>
      {combinations.map(mask => {
        const label = sudokuDigits(mask).join(' + '), crossed = excluded.includes(mask)
        return <button key={mask} type="button" className="tool-button killer-combination" aria-label={`Cross out ${label}`}
          aria-pressed={crossed} disabled={disabled} onClick={() => onToggle(mask)}>{label}</button>
      })}
    </div>
    <p className="killer-combinations-count" role="status" aria-live="polite">{combinations.length - excluded.length} of {combinations.length} combinations not crossed out.</p>
    <p className="killer-combinations-note">Use clues; marks don&rsquo;t affect hints.</p>
    <div className="killer-combinations-actions">
      <button type="button" className="tool-button" aria-label="Reset combinations" onClick={onReset} disabled={disabled || excluded.length === 0}>{onClose ? 'Reset' : 'Reset combinations'}</button>
      {onClose && <button type="button" className="tool-button" aria-label="Close combinations" onClick={onClose}>Close</button>}
    </div>
  </section>
}
