import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { expect, it, vi } from 'vitest'
import { LeaderboardsPage } from './LeaderboardsPage'

it('defaults to today and preserves an exact Track size in the chooser', () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-20T12:00:00Z'))
  try {
    const today = renderToStaticMarkup(<MemoryRouter><LeaderboardsPage /></MemoryRouter>)
    expect(today).toContain('2026-10-20')
    expect(today).toContain('Queens')
    expect(today).toContain('Trio')
    expect(today).toContain('Tents')
    const tents = renderToStaticMarkup(<MemoryRouter initialEntries={['/leaderboards?id=2026-10-19-tents']}><LeaderboardsPage /></MemoryRouter>)
    expect(tents).toContain('value="tents" selected=""')
    expect(tents).toContain('href="/archive/2026-10-19-tents"')
    const tracks = renderToStaticMarkup(<MemoryRouter initialEntries={['/leaderboards?id=2026-10-19-tracks-large']}><LeaderboardsPage /></MemoryRouter>)
    expect(tracks).toContain('value="large" selected=""')
    expect(tracks).toContain('2026-10-19')
  } finally { vi.useRealTimers() }
})

it('rejects future and preview IDs rather than requesting a guessed leaderboard', () => {
  for (const id of ['preview-trio', '2099-01-01']) {
    const html = renderToStaticMarkup(<MemoryRouter initialEntries={[`/leaderboards?id=${id}`]}><LeaderboardsPage /></MemoryRouter>)
    expect(html).toContain('Choose a published puzzle')
  }
})
