import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { expect, it } from 'vitest'
import { LeaderboardTable, LeaderboardPanel } from './LeaderboardPanel'
import { SolvedPanel } from './SolvedPanel'

it('shows tied rank/time/hint columns and the owner outside the first 25', () => {
  const html = renderToStaticMarkup(<LeaderboardTable board={{ total: 26,
    entries: [{ rank: 1, nickname: 'Alice', elapsed_ms: 60000, hints: 0, is_you: false },
      { rank: 1, nickname: 'Bob', elapsed_ms: 60000, hints: 0, is_you: false },
      { rank: 3, nickname: 'Carol', elapsed_ms: 1000, hints: 1, is_you: false }],
    own_entry: { rank: 26, nickname: 'Outside', elapsed_ms: 120000, hints: 2, is_you: true },
  }} />)
  expect(html).toContain('Alice')
  expect(html).toContain('1:00')
  expect(html).toContain('2:00')
  expect(html).toContain('Outside')
  expect(html).toContain('You')
  expect(html).toContain('Hints')
  expect(html).toContain('Time')
  expect(html).toContain('26')
})

it('shows disabled configuration without fetching or hiding local solve feedback', () => {
  const html = renderToStaticMarkup(<MemoryRouter><LeaderboardPanel puzzleId="2026-10-19" /></MemoryRouter>)
  expect(html).toContain('not configured')
  const solved = renderToStaticMarkup(<MemoryRouter><SolvedPanel solved firstSolve={null} streak={1} copied="idle" shareText={null} onShare={() => {}} puzzleId="2026-10-19" candidate={null} /></MemoryRouter>)
  expect(solved).toContain('Solved')
  expect(solved).toContain('Copy result')
  expect(solved).toContain('Leaderboard')
})

it('a preview solved panel never offers public participation', () => {
  const html = renderToStaticMarkup(<SolvedPanel solved firstSolve={null} streak={0} copied="idle" shareText={null} onShare={() => {}} />)
  expect(html).not.toContain('Leaderboard')
})
