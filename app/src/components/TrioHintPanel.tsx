import { useMemo } from 'react'
import { trioCandidateNames, trioCellName, type TrioHint } from '../domain/trioHints'
import { HintPanel } from './HintPanel'

export function TrioHintPanel({ hint, id, onApply, onDismiss, onShowCell }: {
  hint: TrioHint; id: string; onApply: () => void; onDismiss: () => void; onShowCell: () => void
}) {
  const reasons = useMemo(() => hint.steps.map((step) => step.reason), [hint])
  const placed = (hint.candidates & (hint.candidates - 1)) === 0
  const removed = hint.steps.at(-1)!.before & ~hint.candidates
  return <HintPanel id={id} location={trioCellName(hint.cell)}
    title={placed ? `Place ${trioCandidateNames(hint.candidates)}` : `Rule out ${trioCandidateNames(removed)}`}
    reasons={reasons}
    effect={placed ? '' : `Apply updates notes to ${trioCandidateNames(hint.candidates)}; the cell stays empty.`}
    onApply={onApply} onDismiss={onDismiss} onShowCell={onShowCell} />
}
