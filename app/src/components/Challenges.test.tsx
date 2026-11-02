import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { expect, it } from 'vitest'
import type { SolveRecord } from '../lib/stats'
import { Challenges } from './Challenges'

it('shows daily and weekly progress with clear rules and an archive link', () => {
  const html = renderToStaticMarkup(<MemoryRouter><Challenges records={[]} today="2026-10-29" timeZone="UTC" /></MemoryRouter>)
  expect(html).toContain('Daily challenge')
  expect(html).toContain('Weekly challenge')
  expect(html).toContain('0 / 3 goals')
  expect(html).toContain('0 / 50 puzzles')
  expect(html).toContain('Solve an archive puzzle')
  expect(html).toContain('Replays don')
  expect(html).toContain('href="/archive"')
})

it('announces daily completion while showing the weekly count', () => {
  const records: SolveRecord[] = [
    { id: '2026-10-20', puzzleType: 'queens', size: 8, hints: 1, elapsedMs: 1000, solvedAt: Date.parse('2026-10-29T09:00:00Z') },
    { id: '2026-10-29-trio', puzzleType: 'trio', size: 9, hints: 0, elapsedMs: 1000, solvedAt: Date.parse('2026-10-29T10:00:00Z') },
  ]
  const html = renderToStaticMarkup(<MemoryRouter><Challenges records={records} today="2026-10-29" timeZone="UTC" /></MemoryRouter>)
  expect(html).toContain('Complete!')
  expect(html).toContain('2 / 50 puzzles')
})
