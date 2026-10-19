import { useEffect, useRef } from 'react'

export function HintPanel({ id, location, title, reasons, effect, onApply, onDismiss, onShowCell }: {
  id: string; location: string; title: string; reasons: readonly string[]; effect?: string
  onApply: () => void; onDismiss: () => void; onShowCell: () => void
}) {
  const panel = useRef<HTMLElement>(null)
  useEffect(() => {
    panel.current?.focus({ preventScroll: true })
    panel.current?.scrollIntoView({ block: 'nearest' })
  }, [reasons])
  return <section className="hint-panel" ref={panel} tabIndex={-1} aria-labelledby={`${id}-title`} id={id}
    onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); onDismiss() } }}>
    <div className="hint-heading">
      <div><p className="eyebrow">Explained hint · <button type="button" className="hint-location" onClick={onShowCell}
        aria-label={`Show hint target at ${location}`}>{location}</button></p>
        <h2 id={`${id}-title`}>{title}</h2></div>
      <button type="button" className="tool-button" onClick={onDismiss} aria-label="Dismiss hint">×</button>
    </div>
    <p className="hint-key">Target: solid outline · Support: dashed</p>
    <ol>{reasons.map((reason, i) => <li key={i}>{reason}</li>)}</ol>
    {effect && <p className="hint-effect">{effect}</p>}
    <button type="button" className="tool-button apply-hint" onClick={onApply}>Apply move</button>
    <span className="hint-undo">Undo is available until solved.</span>
  </section>
}
