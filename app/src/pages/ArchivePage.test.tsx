/** Archive rendering and URL selection use the existing server renderer. */

import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { groupPublishedPuzzles, type PublishedPuzzle } from '../lib/puzzles'
import type { DifficultyBand } from '../domain/puzzle'
import { ArchiveGroups, ArchivePage } from './ArchivePage'

const UTC = 'UTC'

/** Render the archive body the way the page does, for a set of published entries. */
function render(puzzles: readonly PublishedPuzzle[], page = 0, solved: readonly string[] = []): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <ArchiveGroups groups={groupPublishedPuzzles(puzzles)} timeZone={UTC} page={page} solved={new Set(solved)} />
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
  it('keeps sizes grouped under one family and labels legacy dimensions honestly', () => {
    const html = render([
      { id: '2026-10-17-tracks-small', type: 'train-tracks', difficulty: null, width: 8, height: 8 },
      { id: '2026-10-17-tracks-medium', type: 'train-tracks', difficulty: null, width: 10, height: 10 },
      { id: '2026-10-17-tracks-large', type: 'train-tracks', difficulty: null, width: 12, height: 12 },
      { id: '2026-10-16-tracks', type: 'train-tracks', difficulty: null, width: 7, height: 7 },
    ])
    expect(html.match(/archive-group-title/g)).toHaveLength(1)
    expect(html.match(/<li>/g)).toHaveLength(2)
    expect(html).toContain('Train Tracks Small · 8×8')
    expect(html).toContain('Train Tracks Medium · 10×10')
    expect(html).toContain('Train Tracks Large · 12×12')
    expect(html).toContain('7×7')
    expect(html).not.toContain('Small · 7×7')
  })

  it('names each family in a heading and nests its puzzles underneath', () => {
    const html = render([
      queens('2026-10-03'),
      queens('2026-10-02'),
      starBattle('2026-10-03-star'),
      starBattle('2026-10-02-star'),
    ])

    // Two headings, each one family, in the declared order.
    expect(html).toContain('<h2 class="archive-group-title">Queens</h2>')
    expect(html).toContain('<h2 class="archive-group-title">Star Battle</h2>')
    expect(html.indexOf('Queens')).toBeLessThan(html.indexOf('Star Battle'))

    // Every puzzle sits inside a list belonging to its own family's block, so the
    // two puzzles of a day are no longer only distinguishable by their date.
    const queensBlock = html.slice(
      html.indexOf('<h2 class="archive-group-title">Queens</h2>'),
      html.indexOf('<h2 class="archive-group-title">Star Battle</h2>'),
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

  it('carries an older archive page into its puzzle links', () => {
    const html = render([queens('2026-10-03')], 2)
    expect(html).toContain('href="/archive/2026-10-03?page=2"')
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

  it('marks a completed puzzle and leaves unsolved puzzles unmarked', () => {
    const html = render([queens('2026-10-03'), queens('2026-10-02')], 0, ['2026-10-03'])
    const link = (id: string) => html.match(new RegExp(`<a[^>]*href="/archive/${id}"[^>]*>.*?</a>`))?.[0]
    expect(link('2026-10-03')).toContain('Completed')
    expect(link('2026-10-02')).not.toContain('Completed')
    expect(html.match(/class="archive-completed"/g)).toHaveLength(1)
  })

  it('marks individual sizes and levels by puzzle id, including in their labels', () => {
    const html = render([
      { id: '2026-10-17-tracks-small', type: 'train-tracks', difficulty: null, width: 8, height: 8 },
      { id: '2026-10-17-tracks-medium', type: 'train-tracks', difficulty: null, width: 10, height: 10 },
      { id: '2026-10-17-tracks-large', type: 'train-tracks', difficulty: null, width: 12, height: 12 },
      { id: '2026-10-17-sudoku-easy', type: 'sudoku', difficulty: null, width: 9, height: 9 },
      { id: '2026-10-17-sudoku-medium', type: 'sudoku', difficulty: null, width: 9, height: 9 },
      { id: '2026-10-17-sudoku-hard', type: 'sudoku', difficulty: null, width: 9, height: 9 },
      { id: '2026-10-17-killer-sudoku-easy', type: 'killer-sudoku', difficulty: null, width: 9, height: 9 },
      { id: '2026-10-17-killer-sudoku-medium', type: 'killer-sudoku', difficulty: null, width: 9, height: 9 },
      { id: '2026-10-17-killer-sudoku-hard', type: 'killer-sudoku', difficulty: null, width: 9, height: 9 },
    ], 0, ['2026-10-17-tracks-medium', '2026-10-17-sudoku-hard', '2026-10-17-killer-sudoku-medium'])
    expect(html.match(/class="archive-completed"/g)).toHaveLength(3)
    expect(html).toContain('aria-label="Sat, Oct 17, 2026, Train Tracks Medium · 10×10, Completed"')
    expect(html).toContain('aria-label="Sat, Oct 17, 2026, Sudoku Hard · 9×9, Completed"')
    expect(html).toContain('aria-label="Sat, Oct 17, 2026, Killer Sudoku Medium · 9×9, Completed"')
    expect(html).toContain('aria-label="Sat, Oct 17, 2026, Train Tracks Small · 8×8"')
    expect(html).not.toContain('aria-label="Sat, Oct 17, 2026, Train Tracks Small · 8×8, Completed"')
  })

  it('omits a family with nothing published', () => {
    const html = render([queens('2026-10-03')])
    expect(html).toContain('<h2 class="archive-group-title">Queens</h2>')
    expect(html).not.toContain('Star Battle')
  })

  it('says so when nothing at all is published', () => {
    expect(render([])).toContain('No puzzles in this archive window.')
    expect(render([])).toContain('Connect to load')
  })
})


it('says completion comes from solve history saved in this browser', () => {
  const html = renderToStaticMarkup(<MemoryRouter><ArchivePage /></MemoryRouter>)
  expect(html).toContain('Completed marks reflect solve history saved in this browser.')
})

it('lists published Word Paths under its own archive heading', () => {
  const html = render([
    queens('2026-10-15'),
    { id: '2026-10-15-words', type: 'word-paths', difficulty: null, width: 5, height: 5 },
  ])
  expect(html).toContain('<h2 class="archive-group-title">Word Paths</h2>')
  expect(html).toContain('href="/archive/2026-10-15-words"')
  expect(html).not.toContain('Easy')
})


it.each([
  ['/archive?game=word-paths', 'word-paths'],
  ['/archive?game=trio', 'trio'],
  ['/archive?game=tents', 'tents'],
  ['/archive?game=unknown', 'queens'],
  ['/archive', 'queens'],
])('selects the archive game from %s', (url, selected) => {
  const html = renderToStaticMarkup(<MemoryRouter initialEntries={[url]}><ArchivePage /></MemoryRouter>)
  const selectedLinks = html.match(/<a[^>]*aria-current="page"[^>]*>/g)
  expect(selectedLinks).toHaveLength(1)
  expect(selectedLinks![0]).toContain(`href="/archive?game=${selected}"`)
})

it('lists daily Trio under its own heading without a difficulty rating', () => {
  const html = render([{ id: '2026-09-26-trio', type: 'trio', difficulty: null, width: 9, height: 9 }])
  expect(html).toContain('<h2 class="archive-group-title">Trio</h2>')
  expect(html).toContain('href="/archive/2026-09-26-trio"')
  expect(html).not.toContain('Easy')
})

it('lists daily Tents under its own heading without a difficulty rating', () => {
  const html = render([{ id: '2026-09-26-tents', type: 'tents', difficulty: null, width: 10, height: 10 }])
  expect(html).toContain('<h2 class="archive-group-title">Tents</h2>')
  expect(html).toContain('href="/archive/2026-09-26-tents"')
  expect(html).not.toContain('Easy')
})
