import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { expect, it, vi } from 'vitest'
import easy from '../../public/puzzles/2026-10-27-killer-sudoku-easy.json'
import medium from '../../public/puzzles/2026-10-27-killer-sudoku-medium.json'
import hard from '../../public/puzzles/2026-10-27-killer-sudoku-hard.json'
import { parsePuzzle } from '../domain/puzzle'
import { TodayCards } from './HomePage'
import { ArchiveGroups } from './ArchivePage'
import { LeaderboardsPage } from './LeaderboardsPage'

const boards = [easy, medium, hard]
it('groups the three daily Killer Sudoku levels on Today and in the archive', () => {
  const probes = boards.map(raw => ({ id: raw.id, puzzle: parsePuzzle(raw) }))
  const today = renderToStaticMarkup(<MemoryRouter><TodayCards probes={probes} solved={new Set()} /></MemoryRouter>)
  expect(today.match(/game-card game-killer-sudoku/g)).toHaveLength(1)
  const archive = renderToStaticMarkup(<MemoryRouter><ArchiveGroups groups={[{ type: 'killer-sudoku', puzzles: boards.map(board => ({ id: board.id, type: 'killer-sudoku', difficulty: null, width: 9, height: 9 })) }]} timeZone="UTC" page={0} /></MemoryRouter>)
  for (const board of boards) {
    expect(today).toContain(`href="/archive/${board.id}"`)
    expect(archive).toContain(`href="/archive/${board.id}"`)
  }
})

it('keeps the selected Killer Sudoku level on the leaderboard', () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-27T12:00:00Z'))
  try {
    const html = renderToStaticMarkup(<MemoryRouter initialEntries={['/leaderboards?id=2026-10-27-killer-sudoku-hard']}><LeaderboardsPage /></MemoryRouter>)
    expect(html).toContain('value="hard" selected=""')
    expect(html).toContain('href="/archive/2026-10-27-killer-sudoku-hard"')
  } finally { vi.useRealTimers() }
})
