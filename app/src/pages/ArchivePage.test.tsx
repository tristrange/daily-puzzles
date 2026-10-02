/**
 * Markup tests for the archive page.
 *
 * The suite has no component renderer, so components are rendered to static markup
 * with `react-dom/server` instead: no browser, no DOM shim, no new dependency. That
 * covers the structure the grouping change is actually about -- a named block per
 * family, its puzzles nested underneath -- without standing up a full rendering
 * library, which is a larger decision than the feature warrants.
 */

import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { groupPublishedPuzzles, type PublishedPuzzle } from '../lib/puzzles'
import type { DifficultyBand } from '../domain/puzzle'
import { ArchiveGroups } from './ArchivePage'

const UTC = 'UTC'

/** Render the archive body the way the page does, for a set of published entries. */
function render(puzzles: readonly PublishedPuzzle[]): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <ArchiveGroups groups={groupPublishedPuzzles(puzzles)} timeZone={UTC} />
    </MemoryRouter>,
  )
}

const queens = (id: string, difficulty: DifficultyBand | null = null): PublishedPuzzle => ({
  id,
  type: 'queens',
  difficulty,
})

const starBattle = (id: string, difficulty: DifficultyBand | null = null): PublishedPuzzle => ({
  id,
  type: 'star-battle',
  difficulty,
})

describe('ArchiveGroups', () => {
  it('names each family in a heading and nests its puzzles underneath', () => {
    const html = render([
      queens('2026-10-03'),
      queens('2026-10-02'),
      starBattle('2026-10-03-star'),
      starBattle('2026-10-02-star'),
    ])

    // Two headings, each one family, in the declared order.
    expect(html).toContain('<h3 class="archive-group-title">Queens</h3>')
    expect(html).toContain('<h3 class="archive-group-title">Star Battle</h3>')
    expect(html.indexOf('Queens')).toBeLessThan(html.indexOf('Star Battle'))

    // Every puzzle sits inside a list belonging to its own family's block, so the
    // two puzzles of a day are no longer only distinguishable by their date.
    const queensBlock = html.slice(
      html.indexOf('<h3 class="archive-group-title">Queens</h3>'),
      html.indexOf('<h3 class="archive-group-title">Star Battle</h3>'),
    )
    expect(queensBlock).toContain('href="/archive/2026-10-03"')
    expect(queensBlock).toContain('href="/archive/2026-10-02"')
    expect(queensBlock).not.toContain('2026-10-03-star')
  })

  it('links each puzzle to its own archive page', () => {
    const html = render([queens('2026-10-03'), starBattle('2026-10-03-star')])
    expect(html).toContain('href="/archive/2026-10-03"')
    expect(html).toContain('href="/archive/2026-10-03-star"')
  })

  it('shows the band beside the date, and nothing at all when there is none', () => {
    // A pre-ramp file records no band, and printing "Easy" would be a claim the
    // file never made.
    const html = render([queens('2026-10-03', 3), queens('2026-10-02')])
    expect(html).toContain('<span class="stat-detail">Hard</span>')
    expect(html.match(/stat-detail/g)).toHaveLength(1)
  })

  it('labels each row with the date a player recognises', () => {
    const html = render([queens('2026-10-03')])
    expect(html).toContain('Sat, Oct 3, 2026')
  })

  it('omits a family with nothing published', () => {
    const html = render([queens('2026-10-03')])
    expect(html).toContain('<h3 class="archive-group-title">Queens</h3>')
    expect(html).not.toContain('Star Battle')
  })

  it('says so when nothing at all is published', () => {
    expect(render([])).toContain('No puzzles have been published yet.')
  })
})