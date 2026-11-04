import { describe, expect, it } from 'vitest'
import { archiveHref, archiveWindow, parseArchivePage, parseArchiveView, puzzleHref } from './archive'

describe('parseArchivePage', () => {
  it('falls back to the newest window for anything but a bounded page number', () => {
    expect(parseArchivePage(null)).toBe(0)
    expect(parseArchivePage('2')).toBe(2)
    expect(parseArchivePage('0')).toBe(0)
    expect(parseArchivePage('-1')).toBe(0)
    expect(parseArchivePage('1.5')).toBe(0)
    expect(parseArchivePage('1001')).toBe(0)
  })
})

it('keeps defaults and bounds invalid view settings', () => {
  expect(parseArchiveView(new URLSearchParams())).toEqual({ days: 7, order: 'newest', range: 'all' })
  expect(parseArchiveView(new URLSearchParams('days=999&order=random&range=1'))).toEqual({ days: 7, order: 'newest', range: 'all' })
})

it('pages whole dates in either order and respects a rolling range', () => {
  const view = { days: 7, order: 'oldest', range: '30' } as const
  const first = archiveWindow('2026-10-30', 0, view)
  const last = archiveWindow('2026-10-30', 4, view)
  expect(first.days).toEqual(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07'])
  expect(first.hasNext).toBe(true)
  expect(last.days).toEqual(['2026-10-29', '2026-10-30'])
  expect(last.hasNext).toBe(false)
  expect(archiveWindow('2026-10-30', 0, { ...view, order: 'newest', days: 14 }).days[0]).toBe('2026-10-30')
})

it('carries the page and view through a puzzle link and back', () => {
  const view = { days: 14, order: 'oldest', range: '90' } as const
  expect(puzzleHref('2026-10-04-sudoku-easy', 2, view)).toBe('/archive/2026-10-04-sudoku-easy?page=2&days=14&order=oldest&range=90')
  expect(archiveHref('sudoku', 2, view)).toBe('/archive?game=sudoku&page=2&days=14&order=oldest&range=90')
})
