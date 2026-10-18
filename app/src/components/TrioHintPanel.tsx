import { useEffect, useRef } from 'react'
import { trioCandidateNames, trioCellName, type TrioHint } from '../domain/trioHints'

export function TrioHintPanel({ hint, id, onApply, onDismiss, onShowCell }: {
  hint: TrioHint; id: string; onApply: () => void; onDismiss: () => void; onShowCell: () => void
}) {
  const panel = useRef<HTMLElement>(null)
  useEffect(() => {
    panel.current?.focus({ preventScroll: true })
    panel.current?.scrollIntoView({ block: 'nearest' })
  }, [hint])
  const placed = (hint.candidates & (hint.candidates - 1)) === 0
  const removed = hint.steps.at(-1)!.before & ~hint.candidates
  return <section className="trio-hint" ref={panel} tabIndex={-1} aria-labelledby={`${id}-title`} id={id}
    onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); onDismiss() } }}>
    <div className="trio-hint-heading">
      <div><p className="eyebrow">Explained hint · <button type="button" className="trio-hint-location" onClick={onShowCell}
        aria-label={`Show hint target at ${trioCellName(hint.cell)}`}>{trioCellName(hint.cell)}</button></p>
        <h2 id={`${id}-title`}>{placed ? `Place ${trioCandidateNames(hint.candidates)}` : `Rule out ${trioCandidateNames(removed)}`}</h2></div>
      <button type="button" className="tool-button" onClick={onDismiss} aria-label="Dismiss hint">×</button>
    </div>
    <p className="trio-hint-key">Target: solid outline · Support: dashed</p>
    <ol>{hint.steps.map((step, i) => <li key={i}>{step.reason}</li>)}</ol>
    {!placed && <p className="trio-hint-effect">Apply updates notes to {trioCandidateNames(hint.candidates)}; the cell stays empty.</p>}
    <button type="button" className="tool-button trio-apply-hint" onClick={onApply}>Apply move</button>
    <span className="trio-hint-undo">You can Undo this move.</span>
  </section>
}
