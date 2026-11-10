// @vitest-environment jsdom
import { act, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { expect, it, vi } from 'vitest'
import { TrackGrid } from '../domain/tracks'
import type { Puzzle } from '../domain/puzzle'
import { readStoredStats } from '../lib/stats'
import { TracksStage } from './TracksStage'

const leaderboard = vi.hoisted(() => ({ offerSolve: vi.fn() }))
vi.mock('../lib/useLeaderboard', () => ({ useLeaderboard: () => leaderboard }))

it('records an initially solved board once under Strict Mode', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  localStorage.clear()
  leaderboard.offerSolve.mockClear()
  const grid = new TrackGrid(3, 1, [3], [1, 1, 1], [1, 1, 1])
  const puzzle: Puzzle = { id: '2026-10-19-tracks-small', puzzleType: 'train-tracks', seed: 1, generatorVersion: 1, board: grid, difficulty: null }
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  try {
    await act(async () => root.render(<StrictMode><MemoryRouter><TracksStage puzzle={puzzle} grid={grid} timeZone="UTC" /></MemoryRouter></StrictMode>))
    expect(readStoredStats()).toHaveLength(1)
    expect(leaderboard.offerSolve).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain('Solved — nice!')
    expect(container.textContent).not.toContain('Solved again')
  } finally {
    await act(async () => root.unmount())
    container.remove()
    localStorage.clear()
    vi.unstubAllGlobals()
  }
})
