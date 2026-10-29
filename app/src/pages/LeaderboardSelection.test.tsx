// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { LeaderboardsPage } from './LeaderboardsPage'

vi.mock('../components/LeaderboardPanel', () => ({ LeaderboardPanel: () => <p>Leaderboard</p> }))

let container: HTMLDivElement, root: Root
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-29T12:00:00Z'))
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => {
  await act(async () => root.unmount()); container.remove()
  vi.useRealTimers(); vi.unstubAllGlobals()
})

it.each([
  ['sudoku', '2026-10-01-sudoku-easy'],
  ['word-paths', '2026-10-01-words'],
  ['nurikabe', '2026-10-01-nurikabe'],
] as const)('keeps the selected date when switching to backfilled %s', async (type, id) => {
  await act(async () => root.render(<MemoryRouter initialEntries={['/leaderboards?id=2026-10-01']}><LeaderboardsPage /></MemoryRouter>))
  const game = container.querySelector<HTMLSelectElement>('select')!
  await act(async () => { game.value = type; game.dispatchEvent(new Event('change', { bubbles: true })) })
  expect(game.value).toBe(type)
  expect(container.querySelector<HTMLInputElement>('input[type="date"]')?.value).toBe('2026-10-01')
  expect(container.querySelector(`a[href="/archive/${id}"]`)).not.toBeNull()
  expect(container.textContent).not.toContain('first available')
})

it('moves dates before the archive to the first available date', async () => {
  await act(async () => root.render(<MemoryRouter initialEntries={['/leaderboards?id=2026-10-01-sudoku-hard']}><LeaderboardsPage /></MemoryRouter>))
  const input = container.querySelector<HTMLInputElement>('input[type="date"]')!
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  await act(async () => { setter.call(input, '2026-09-25'); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })) })
  expect(input.value).toBe('2026-09-26')
  expect(container.querySelector('a[href="/archive/2026-09-26-sudoku-hard"]')).not.toBeNull()
  expect(container.textContent).toContain('first available')
})

it('keeps the selected Sudoku level when moving between available dates', async () => {
  await act(async () => root.render(<MemoryRouter initialEntries={['/leaderboards?id=2026-10-25-sudoku-hard']}><LeaderboardsPage /></MemoryRouter>))
  const input = container.querySelector<HTMLInputElement>('input[type="date"]')!
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  await act(async () => { setter.call(input, '2026-10-26'); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })) })
  expect(container.querySelectorAll<HTMLSelectElement>('select')[1]?.value).toBe('hard')
  expect(container.querySelector('a[href="/archive/2026-10-26-sudoku-hard"]')).not.toBeNull()
  expect(container.textContent).not.toContain('first available')
})

it('explains when the selected game has no available days yet', async () => {
  vi.setSystemTime(new Date('2026-09-25T12:00:00Z'))
  await act(async () => root.render(<MemoryRouter initialEntries={['/leaderboards?id=2026-09-25']}><LeaderboardsPage /></MemoryRouter>))
  const game = container.querySelector<HTMLSelectElement>('select')!
  await act(async () => { game.value = 'sudoku'; game.dispatchEvent(new Event('change', { bubbles: true })) })
  expect(game.value).toBe('queens')
  expect(container.querySelector('[role="status"]')?.textContent).toContain('Sudoku puzzles are not available yet')
})

it('offers the original and named Track boards on dates where both exist', async () => {
  await act(async () => root.render(<MemoryRouter initialEntries={['/leaderboards?id=2026-10-01-tracks-medium']}><LeaderboardsPage /></MemoryRouter>))
  const size = container.querySelectorAll<HTMLSelectElement>('select')[1]!
  expect(Array.from(size.options, option => option.value)).toEqual(['original', 'small', 'medium', 'large'])
  await act(async () => { size.value = 'original'; size.dispatchEvent(new Event('change', { bubbles: true })) })
  expect(container.querySelector('a[href="/archive/2026-10-01-tracks"]')).not.toBeNull()
  const input = container.querySelector<HTMLInputElement>('input[type="date"]')!
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  await act(async () => { setter.call(input, '2026-10-02'); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })) })
  expect(container.querySelector('a[href="/archive/2026-10-02-tracks"]')).not.toBeNull()
  await act(async () => { setter.call(input, '2026-10-17'); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })) })
  expect(container.querySelector('a[href="/archive/2026-10-17-tracks-small"]')).not.toBeNull()
  expect(Array.from(size.options, option => option.value)).toEqual(['small', 'medium', 'large'])
})
