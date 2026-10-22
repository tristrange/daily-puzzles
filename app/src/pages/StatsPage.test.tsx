/** Stats rendering uses the existing server renderer and a local history fixture. */

import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PUZZLE_TYPES } from '../domain/board'
import { PUZZLE_TYPE_LABEL } from '../domain/games'
import { STATS_STORAGE_KEY } from '../lib/stats'
import { StatsPage } from './StatsPage'

type Stored = {
  readonly id: string
  readonly puzzleType: string
  readonly size: number
  readonly elapsedMs: number
  readonly hints: number
  readonly solvedAt: number
}

const solve = (id: string, puzzleType: string, solvedAt: number): Stored => ({
  id,
  puzzleType,
  size: 8,
  elapsedMs: 60_000,
  hints: 0,
  solvedAt,
})

/** Render the page against a history written to a stubbed `localStorage`. */
function renderHistory(records: readonly Stored[], url = '/stats'): string {
  const stored = new Map<string, string>([[STATS_STORAGE_KEY, JSON.stringify(records)]])
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => void stored.set(key, value),
    removeItem: (key: string) => void stored.delete(key),
  })
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[url]}>
      <StatsPage />
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('the family counts', () => {
  it('distinguishes all three sizes in recent solves', () => {
    const html = renderHistory([
      solve('2026-10-17-tracks-small', 'train-tracks', 1),
      solve('2026-10-17-tracks-medium', 'train-tracks', 2),
      solve('2026-10-17-tracks-large', 'train-tracks', 3),
    ], '/stats?game=train-tracks')
    expect(html).toContain('Train Tracks Small')
    expect(html).toContain('Train Tracks Medium')
    expect(html).toContain('Train Tracks Large')
  })

  /**
   * Any status paragraph naming a family — which today means the split under
   * the grid, and nothing else. The names come from the registry so that a
   * rename cannot quietly turn an absence assertion into one that passes
   * because it is looking for a word the page stopped using.
   */
  const familySentence = (html: string) => {
    const names = PUZZLE_TYPES.map((type) => PUZZLE_TYPE_LABEL[type]).join('|')
    return html.slice(0, html.indexOf('Recent solves')).match(new RegExp(`<p class="status">[^<]*(${names})[^<]*</p>`, 'g'))
  }

  it('counts both families when the history spans both', () => {
    const html = renderHistory([
      solve('2026-10-05', 'queens', 1),
      solve('2026-10-04', 'queens', 2),
      solve('2026-10-05-star', 'star-battle', 3),
    ])
    expect(html).toContain('2 Queens and 1 Star Battle.')
  })

  it('says nothing for a Queens-only history, because the total already says it', () => {
    const html = renderHistory([solve('2026-10-05', 'queens', 1)])
    expect(familySentence(html)).toBeNull()
  })

  it('says nothing for a Star Battle-only history, rather than padding it with a zero', () => {
    const html = renderHistory([solve('2026-10-05-star', 'star-battle', 1)])
    expect(familySentence(html)).toBeNull()
  })
})


describe('stats and recent solves by game', () => {
  it('summarises only the selected game while preserving the all-games totals', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-22T12:00:00Z'))
    const html = renderHistory([
      { ...solve('2026-10-20-trio', 'trio', 1), elapsedMs: 120_000, hints: 1 },
      { ...solve('2026-10-21-trio', 'trio', 2), elapsedMs: 240_000, hints: 2 },
      { ...solve('2026-10-22', 'queens', 3), elapsedMs: 60_000, hints: 7 },
    ], '/stats?game=trio')
    const trio = html.match(/<dl[^>]*aria-label="Trio statistics"[^>]*>(.*?)<\/dl>/)?.[1]
    const all = html.match(/<dl[^>]*aria-label="All games statistics"[^>]*>(.*?)<\/dl>/)?.[1]
    expect(trio).toContain('<dt>Solved</dt><dd>2</dd>')
    expect(trio).toContain('<dt>Average</dt><dd>3:00</dd>')
    expect(trio).toContain('<dt>Fastest</dt><dd>2:00</dd>')
    expect(trio).toContain('<dt>Hints used</dt><dd>3</dd>')
    expect(trio).toContain('<dt>Current streak</dt><dd>2 days</dd>')
    expect(trio).toContain('<dt>Best streak</dt><dd>2 days</dd>')
    expect(all).toContain('<dt>Solved</dt><dd>3</dd>')
    expect(all).toContain('<dt>Average</dt><dd>2:20</dd>')
    expect(all).toContain('<dt>Fastest</dt><dd>1:00</dd>')
    expect(all).toContain('<dt>Hints used</dt><dd>10</dd>')
    expect(all).toContain('<dt>Current streak</dt><dd>3 days</dd>')
  })

  it('uses all solves of the selected game for its average, beyond the ten recent entries', () => {
    const html = renderHistory([
      ...Array.from({ length: 12 }, (_, i) => ({
        ...solve(`2026-10-${String(i + 1).padStart(2, '0')}-trio`, 'trio', i),
        elapsedMs: i === 0 ? 600_000 : 120_000,
      })),
      solve('2026-10-12', 'queens', 12),
    ], '/stats?game=trio')
    const trio = html.match(/<dl[^>]*aria-label="Trio statistics"[^>]*>(.*?)<\/dl>/)?.[1]
    expect(trio).toContain('<dt>Solved</dt><dd>12</dd>')
    expect(trio).toContain('<dt>Average</dt><dd>2:40</dd>')
    const recent = html.slice(html.indexOf('Recent solves'))
    expect(recent.match(/href="\/archive\//g)).toHaveLength(10)
    expect(recent).not.toContain('href="/archive/2026-10-01-trio"')
    expect(recent).not.toContain('href="/archive/2026-10-12"')
  })

  it('filters by the recorded game without changing the all-games overview', () => {
    const html = renderHistory([
      solve('2026-10-05', 'queens', 2),
      solve('2026-10-04-star', 'star-battle', 1),
    ], '/stats?game=queens')
    const recent = html.slice(html.indexOf('Recent solves'))
    expect(html).toContain('<dt>Solved</dt><dd>2</dd>')
    expect(html).toContain('All games')
    expect(recent).toContain('href="/archive/2026-10-05"')
    expect(recent).not.toContain('href="/archive/2026-10-04-star"')
    expect(html).toContain('Clear all stats')
  })

  it('filters before taking the ten most recently completed solves', () => {
    const html = renderHistory([
      solve('2026-10-01', 'queens', 1),
      ...Array.from({ length: 11 }, (_, i) => solve(`2026-10-${String(i + 2).padStart(2, '0')}-star`, 'star-battle', i + 2)),
    ], '/stats?game=queens')
    expect(html).toContain('href="/archive/2026-10-01"')
  })

  it('shows an empty selected game without hiding history controls', () => {
    const html = renderHistory([solve('2026-10-05', 'queens', 1)], '/stats?game=word-paths')
    expect(html).toContain('No Word Paths solves yet.')
    expect(html).not.toContain('aria-label="Word Paths statistics"')
    expect(html).toContain('Clear all stats')
    expect(html.slice(html.indexOf('Recent solves'))).not.toContain('href="/archive/2026-10-05"')
  })

  it.each(['/stats', '/stats?game=unknown'])('defaults to Queens for %s', url => {
    const html = renderHistory([solve('2026-10-05', 'queens', 1)], url)
    const selected = html.match(/<a[^>]*aria-current="page"[^>]*>/g)
    expect(selected).toHaveLength(1)
    expect(selected![0]).toContain('href="/stats?game=queens"')
  })
})

it('keeps status feedback in a visible live region', () => {
  const html = renderHistory([])
  expect(html).toContain('class="stats-notice"')
  expect(html).toContain('role="status"')
  expect(html).not.toContain('class="sr-only"')
})

it('offers import with no history and export once there is a solve', () => {
  const empty = renderHistory([])
  expect(empty).toContain('Import stats')
  expect(empty).not.toContain('Export stats')

  const populated = renderHistory([solve('2026-10-05', 'queens', 1)])
  expect(populated).toContain('Import stats')
  expect(populated).toContain('Export stats')
})

it('filters daily Trio solves and retains the normal result link', () => {
  const html = renderHistory([solve('2026-10-18-trio', 'trio', 1), solve('2026-10-18', 'queens', 2)], '/stats?game=trio')
  expect(html).toContain('href="/archive/2026-10-18-trio"')
  expect(html).not.toContain('href="/archive/2026-10-18"')
  expect(html).toContain('Trio')
})

it('filters daily Tents solves and retains the normal result link', () => {
  const html = renderHistory([solve('2026-10-18-tents', 'tents', 1), solve('2026-10-18', 'queens', 2)], '/stats?game=tents')
  expect(html).toContain('href="/archive/2026-10-18-tents"')
  expect(html).not.toContain('href="/archive/2026-10-18"')
  expect(html).toContain('Tents')
})

it('distinguishes daily Sudoku levels and links each exact puzzle', () => {
  const html = renderHistory(['easy', 'medium', 'hard'].map((level, i) => solve(`2026-10-21-sudoku-${level}`, 'sudoku', i + 1)), '/stats?game=sudoku')
  for (const label of ['Easy', 'Medium', 'Hard']) {
    expect(html).toContain(`Sudoku ${label}`)
    expect(html).toContain(`href="/archive/2026-10-21-sudoku-${label.toLowerCase()}"`)
  }
  expect(html).toContain('<dt>Solved</dt><dd>3</dd>')
})
