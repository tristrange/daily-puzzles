import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { puzzleIdFor } from '../domain/dates'
import { STATS_STORAGE_KEY, type SolveRecord } from '../lib/stats'
import { SolvedPanel, type SolvedPanelProps } from './SolvedPanel'

afterEach(() => vi.unstubAllGlobals())

const record: SolveRecord = { id: puzzleIdFor('2026-10-20', 'trio'), puzzleType: 'trio', size: 9, elapsedMs: 60_000, hints: 1, solvedAt: 123 }
const props: SolvedPanelProps = { solved: true, firstSolve: null, streak: 1, copied: 'idle', shareText: null, onShare: () => {}, puzzleId: record.id, candidate: record }
const render = (overrides: Partial<SolvedPanelProps> = {}) => renderToStaticMarkup(<MemoryRouter><SolvedPanel {...props} {...overrides} /></MemoryRouter>)

it('celebrates a newly saved stamp and links to the passport', () => {
  vi.stubGlobal('localStorage', { getItem: (key: string) => key === STATS_STORAGE_KEY ? JSON.stringify([record]) : null })
  const html = render()
  expect(html).toContain('Trio stamp earned!')
  expect(html).toContain('href="/stats/passport"')
})

it('does not celebrate a replay, preview, or a solve that was not saved', () => {
  vi.stubGlobal('localStorage', { getItem: () => JSON.stringify([record]) })
  expect(render({ firstSolve: record })).not.toContain('stamp earned')
  expect(render({ puzzleId: undefined })).not.toContain('stamp earned')
  vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked storage') } })
  expect(render()).not.toContain('stamp earned')
})
