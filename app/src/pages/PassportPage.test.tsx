import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { puzzleIdFor } from '../domain/dates'
import { STATS_STORAGE_KEY } from '../lib/stats'
import { PassportPage } from './PassportPage'
import { StatsPage } from './StatsPage'

afterEach(() => vi.unstubAllGlobals())

it('shows a local passport with earned and future stamps and links to it from Stats', () => {
  const records = [{ id: puzzleIdFor('2026-10-20', 'trio'), puzzleType: 'trio', size: 9, elapsedMs: 90_000, hints: 2, solvedAt: 1 }]
  vi.stubGlobal('localStorage', { getItem: (key: string) => key === STATS_STORAGE_KEY ? JSON.stringify(records) : null })
  const passport = renderToStaticMarkup(<MemoryRouter><PassportPage /></MemoryRouter>)
  expect(passport).toContain('1 of 9')
  expect(passport).toContain('Trio')
  expect(passport).toContain('Stamp earned')
  expect(passport).toContain('Not collected yet')
  expect(passport).toContain('Explorer')
  const stats = renderToStaticMarkup(<MemoryRouter><StatsPage /></MemoryRouter>)
  expect(stats).toContain('href="/stats/passport"')
  expect(stats).toContain('1 of 9')
})
