import { useMemo } from 'react'
import { trioCandidateNames, trioCellName, type TrioHint } from '../domain/trioHints'
import { trioHintLesson } from '../domain/hintLessons'
import { HintPanel } from './HintPanel'
import type { HintReturn } from '../lib/hintReturn'

export function TrioHintPanel({ hint, id, onApply, onDismiss, onShowCell, puzzleId, saving, resume }: {
  hint: TrioHint; id: string; onApply: () => void; onDismiss: () => void; onShowCell: () => void
  puzzleId?: string | undefined; saving: boolean; resume: HintReturn
}) {
  const reasons = useMemo(() => hint.steps.map((step) => step.reason), [hint])
  const placed = (hint.candidates & (hint.candidates - 1)) === 0
  const removed = hint.steps.at(-1)!.before & ~hint.candidates
  return <HintPanel id={id} location={trioCellName(hint.cell)}
    title={placed ? `Place ${trioCandidateNames(hint.candidates)}` : `Rule out ${trioCandidateNames(removed)}`}
    reasons={reasons}
    lesson={saving ? trioHintLesson(hint) : undefined} puzzleId={puzzleId} resume={resume}
    effect={placed ? '' : `Apply updates notes to ${trioCandidateNames(hint.candidates)}; the cell stays empty.`}
    onApply={onApply} onDismiss={onDismiss} onShowCell={onShowCell} />
}
