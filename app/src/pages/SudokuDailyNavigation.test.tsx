import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { expect, it, vi } from 'vitest'
import raw from '../data/sudoku-previews.json'
import { parsePuzzle } from '../domain/puzzle'
import { TodayCards } from './HomePage'
import { ArchiveGroups } from './ArchivePage'
import { LeaderboardsPage } from './LeaderboardsPage'

const levels = ['easy', 'medium', 'hard'] as const
const probes = () => levels.map((level, i) => {
  const id = `2026-10-21-sudoku-${level}`
  return { id, puzzle: parsePuzzle({ id, type: 'sudoku', seed: i, generatorVersion: 1,
    board: { size: 9, level, givens: raw[i]!.givens } }), elapsedMs: level === 'medium' ? 12345 : null }
})

it('rejects direct Sudoku leaderboard links before launch and accepts all levels from launch onward', () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-22T12:00:00Z'))
  try {
    for (const level of levels) for (const day of ['2026-10-20', '2026-10-21', '2026-10-22']) {
      const id = `${day}-sudoku-${level}`
      const html = renderToStaticMarkup(<MemoryRouter initialEntries={[`/leaderboards?id=${id}`]}><LeaderboardsPage /></MemoryRouter>)
      if (day === '2026-10-20') {
        expect(html).toContain('Choose a published puzzle')
        expect(html).not.toContain('Play this puzzle')
        expect(html).not.toContain('aria-label="Puzzle leaderboard"')
      } else {
        expect(html).toContain(`href="/archive/${id}"`)
        expect(html).toContain('aria-label="Puzzle leaderboard"')
      }
    }
  } finally { vi.useRealTimers() }
})

it('groups Today into one Sudoku card with exact level links, resume and solved states', () => {
  const html = renderToStaticMarkup(<MemoryRouter><TodayCards probes={probes()} solved={new Set(['2026-10-21-sudoku-hard'])} /></MemoryRouter>)
  expect(html.match(/game-card game-sudoku/g)).toHaveLength(1)
  expect(html).toContain('Play Sudoku Easy')
  expect(html).toContain('Resume Sudoku Medium at 0:12')
  expect(html).toContain('Play Sudoku Hard again')
  for (const level of levels) expect(html).toContain(`href="/archive/2026-10-21-sudoku-${level}"`)
})

it('names all archive levels and preserves the selected leaderboard level', () => {
  const html = renderToStaticMarkup(<MemoryRouter><ArchiveGroups groups={[{ type: 'sudoku', puzzles: probes().map(probe => ({ id: probe.id, type: 'sudoku', difficulty: null, width: 9, height: 9 })) }]} timeZone="UTC" page={0} /></MemoryRouter>)
  for (const label of ['Easy', 'Medium', 'Hard']) expect(html).toContain(`Sudoku ${label}`)
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-21T12:00:00Z'))
  try {
    const leaderboard = renderToStaticMarkup(<MemoryRouter initialEntries={['/leaderboards?id=2026-10-21-sudoku-hard']}><LeaderboardsPage /></MemoryRouter>)
    expect(leaderboard).toContain('value="hard" selected=""')
    expect(leaderboard).toContain('href="/archive/2026-10-21-sudoku-hard"')
  } finally { vi.useRealTimers() }
})
