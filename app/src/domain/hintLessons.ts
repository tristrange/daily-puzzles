import type { CheckedHint } from './checkedHints'
import type { NurikabeHint } from './nurikabeHints'
import type { SudokuHint } from './sudokuHints'
import type { TentsHint } from './tentsHints'
import type { TrackHint } from './trackHints'
import type { TrioHint } from './trioHints'

export type HintLesson = { readonly path: string; readonly title: string }

const sudokuLessons: Readonly<Record<string, HintLesson | undefined>> = {
  'locked-candidate': { path: '/learn/sudoku/locked-candidates', title: 'locked candidates' },
  'naked-pair': { path: '/learn/sudoku/pairs', title: 'naked pairs' },
  'hidden-pair': { path: '/learn/sudoku/hidden-pairs', title: 'hidden pairs' },
  'naked-triple': { path: '/learn/sudoku/naked-triples', title: 'naked triples' },
  'x-wing': { path: '/learn/sudoku/x-wing', title: 'X-Wings' },
}

export function sudokuHintLesson(hint: SudokuHint, killer: boolean): HintLesson | undefined {
  if (hint.correction || !hint.rule) return undefined
  if (killer) return hint.rule === 'cage-combinations'
    ? { path: '/learn/killer-sudoku/cage-combinations', title: 'cage combinations' }
    : undefined
  return sudokuLessons[hint.rule]
}

export function marksHintLesson(game: 'queens' | 'star-battle', hint: CheckedHint): HintLesson | undefined {
  if (hint.action === 'clear') return undefined
  if (game === 'queens') {
    const axis = hint.homes[0]?.[0]
    return hint.rule === 'subset' && hint.sources.length === 2 && hint.sources.every(([kind]) => kind === 'region')
      && hint.homes.length === 2 && (axis === 'row' || axis === 'column') && hint.homes.every(([kind]) => kind === axis)
      ? { path: '/learn/queens/queens-pair-1', title: 'two-region reservations' }
      : undefined
  }
  if (hint.rule === 'intersection') return { path: '/learn/star-battle/star-battle-intersection', title: 'locked spaces' }
  if (hint.rule === 'subset') return { path: '/learn/star-battle/star-battle-subset', title: 'group reservations' }
  return undefined
}

export function nurikabeHintLesson(hint: NurikabeHint): HintLesson | undefined {
  return hint.kind === 'deduction' && hint.rule === 'sea-connection'
    ? { path: '/learn/nurikabe/nurikabe-sea-connection-1', title: 'sea connections' }
    : undefined
}

export function tentsHintLesson(hint: TentsHint): HintLesson | undefined {
  return hint.rule === 'line-arrangements'
    ? { path: '/learn/tents/tents-line-arrangements-1', title: 'line arrangements' }
    : undefined
}

export function trackHintLesson(hint: TrackHint): HintLesson | undefined {
  const rule = hint.steps.at(-1)?.rule
  if (rule === 'loop') return { path: '/learn/train-tracks/tracks-loop-1', title: 'avoiding loops' }
  if ((rule === 'line-connection' || rule === 'line-capacity') && hint.steps.some(step => step.rule === 'edge')) {
    return { path: '/learn/train-tracks/tracks-edges-1', title: 'edges, counts and connections' }
  }
  return undefined
}

export function trioHintLesson(hint: TrioHint): HintLesson | undefined {
  const rule = hint.steps.at(-1)?.rule
  return hint.steps.length > 1 && (rule === 'same' || rule === 'different')
    ? { path: '/learn/trio/trio-relation-propagation', title: 'deductions through links' }
    : undefined
}
