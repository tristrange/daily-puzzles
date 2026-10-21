import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { SudokuPreviewPage } from './SudokuPreviewPage'
afterEach(() => vi.unstubAllGlobals())
it.each([['2', 'Medium'], ['0', 'Easy'], ['garbage', 'Easy']])('selects a playable level from board=%s', (requested, level) => {
  vi.stubGlobal('localStorage', { getItem: () => null })
  const html = renderToStaticMarkup(<MemoryRouter initialEntries={[`/preview/sudoku?board=${requested}`]}><SudokuPreviewPage /></MemoryRouter>)
  expect(html.match(/role="gridcell"/g)).toHaveLength(81)
  expect(html.match(/<option /g)).toHaveLength(3)
  expect(html).toContain(`${level} · 9×9`)
  expect(html).toContain('href="/how-to-play#sudoku"')
  expect(html).toContain('Preview solves do not count toward daily stats')
})
