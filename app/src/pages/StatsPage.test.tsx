/**
 * Markup tests for the stats page's per-family sentence.
 *
 * Same approach as the archive page's tests: no component renderer in the
 * suite, so the page is rendered to static markup with `react-dom/server`, and
 * `localStorage` is stubbed the way `stats.test.ts` stubs it, because reading
 * that is all the page does on the way in.
 *
 * The sentence under the grid is what is under test. It has to count every
 * family the history spans, and it has to stay quiet about the ones it does
 * not: the line it replaces gated on Star Battle alone, so a Queens-only
 * history saw no split while a Star Battle-only one read "0 Queens and 1 Star
 * Battle."
 */

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
function renderHistory(records: readonly Stored[]): string {
  const stored = new Map<string, string>([[STATS_STORAGE_KEY, JSON.stringify(records)]])
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => void stored.set(key, value),
    removeItem: (key: string) => void stored.delete(key),
  })
  return renderToStaticMarkup(
    <MemoryRouter>
      <StatsPage />
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the family counts', () => {
  /**
   * Any status paragraph naming a family — which today means the split under
   * the grid, and nothing else. The names come from the registry so that a
   * rename cannot quietly turn an absence assertion into one that passes
   * because it is looking for a word the page stopped using.
   */
  const familySentence = (html: string) => {
    const names = PUZZLE_TYPES.map((type) => PUZZLE_TYPE_LABEL[type]).join('|')
    return html.match(new RegExp(`<p class="status">[^<]*(${names})[^<]*</p>`, 'g'))
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
