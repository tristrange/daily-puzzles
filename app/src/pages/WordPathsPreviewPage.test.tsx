import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { WordPathsPreviewPage } from './WordPathsPreviewPage'
import { puzzleIdsForDay } from '../domain/dates'
afterEach(() => vi.unstubAllGlobals())
it('offers ten playable previews without publishing a daily slot', () => {
  vi.stubGlobal('localStorage', { getItem: () => null })
  const html = renderToStaticMarkup(<MemoryRouter initialEntries={['/preview/word-paths?board=2']}><WordPathsPreviewPage /></MemoryRouter>)
  expect(html.match(/<option /g)).toHaveLength(10)
  expect(html).toContain('Word Paths')
  expect(html).toContain('Board 2 of 10')
  expect(html).toContain('href="/how-to-play#word-paths"')
  expect(html).toContain('role="grid"')
  expect(html).toContain('do not count toward daily stats')
  expect(puzzleIdsForDay('2026-10-14')).not.toContain('2026-10-14-words')
})
