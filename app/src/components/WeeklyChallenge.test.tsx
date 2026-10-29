import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { expect, it } from 'vitest'
import { puzzleIdFor } from '../domain/dates'
import type { SolveRecord } from '../lib/stats'
import { WeeklyChallenge } from './WeeklyChallenge'

it('offers an optional, clearly explained weekly card with an archive link', () => {
  const html = renderToStaticMarkup(<MemoryRouter><WeeklyChallenge records={[]} today="2026-10-29" timeZone="UTC" /></MemoryRouter>)
  expect(html).toContain('<details')
  expect(html).toContain('Weekly challenge')
  expect(html).toContain('0 of 3 goals complete')
  expect(html).toContain('Solve puzzles from 3 different games')
  expect(html).toContain('Solve an archive puzzle')
  expect(html).toContain('Replays don')
  expect(html).toContain('href="/archive"')
})

it('celebrates completing all three goals', () => {
  const solve = (id: string, puzzleType: SolveRecord['puzzleType'], size: number): SolveRecord => ({
    id, puzzleType, size, hints: 0, elapsedMs: 1000, solvedAt: Date.parse('2026-10-26T12:00:00Z'),
  })
  const records = [
    solve('2026-09-28', 'queens', 8),
    solve('2026-10-26-trio', 'trio', 9),
    solve(puzzleIdFor('2026-10-26', 'train-tracks', 'small'), 'train-tracks', 8),
    solve(puzzleIdFor('2026-10-26', 'train-tracks', 'medium'), 'train-tracks', 10),
  ]
  const html = renderToStaticMarkup(<MemoryRouter><WeeklyChallenge records={records} today="2026-10-29" timeZone="UTC" /></MemoryRouter>)
  expect(html).toContain('All 3 goals complete!')
})
