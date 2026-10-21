import { useEffect, useRef } from 'react'

export function MistakeWarning({ id, onReveal, onDismiss, message = 'Your entries lead to a contradiction. Check your placements and crosses, or try Undo.' }: {
  id: string; onReveal: () => void; onDismiss: () => void; message?: string
}) {
  const panel = useRef<HTMLElement>(null)
  useEffect(() => {
    panel.current?.focus({ preventScroll: true })
    panel.current?.scrollIntoView({ block: 'nearest' })
  }, [])
  return <section className="hint-panel" ref={panel} tabIndex={-1} aria-labelledby={`${id}-title`} id={id}
    onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); onDismiss() } }}>
    <div className="hint-heading">
      <div><p className="eyebrow">Hint check</p><h2 id={`${id}-title`}>Check your entries</h2></div>
      <button type="button" className="tool-button" onClick={onDismiss} aria-label="Dismiss hint">×</button>
    </div>
    <p>{message}</p>
    <button type="button" className="tool-button apply-hint" onClick={onReveal}>Show the mistake</button>
    <span className="hint-undo">Revealing the mistake counts as one hint.</span>
  </section>
}

export function HintPanel({ id, location, title, reasons, effect, onApply, onDismiss, onShowCell, variant = 'logic' }: {
  id: string; location: string; title: string; reasons: readonly string[]; effect?: string
  onApply?: (() => void) | undefined; onDismiss: () => void; onShowCell: () => void; variant?: 'logic' | 'word'
}) {
  const panel = useRef<HTMLElement>(null)
  useEffect(() => {
    panel.current?.focus({ preventScroll: true })
    panel.current?.scrollIntoView({ block: 'nearest' })
  }, [reasons])
  return <section className="hint-panel" ref={panel} tabIndex={-1} aria-labelledby={`${id}-title`} id={id}
    onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); onDismiss() } }}>
    <div className="hint-heading">
      <div><p className="eyebrow">{variant === 'word' ? 'Word hint' : 'Explained hint'} · <button type="button" className="hint-location" onClick={onShowCell}
        aria-label={`Show hint target at ${location}`}>{location}</button></p>
        <h2 id={`${id}-title`}>{title}</h2></div>
      <button type="button" className="tool-button" onClick={onDismiss} aria-label="Dismiss hint">×</button>
    </div>
    <p className="hint-key">{variant === 'word' ? 'Solid: start · Dashed: continuation · Bottom badges: hint order' : 'Target: solid outline · Support: dashed'}</p>
    <ol>{reasons.map((reason, i) => <li key={i}>{reason}</li>)}</ol>
    {effect && <p className="hint-effect">{effect}</p>}
    {onApply && <button type="button" className="tool-button apply-hint" onClick={onApply}>{variant === 'word' ? 'Reveal next letter' : 'Apply move'}</button>}
    <span className="hint-undo">{variant === 'word' ? 'Each revealed letter counts as a hint.' : 'Undo is available until solved.'}</span>
  </section>
}
