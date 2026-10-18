import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { TrioPreviewPage } from './TrioPreviewPage'

afterEach(() => vi.unstubAllGlobals())
it('offers five playable boards and direct rules without daily stats', () => {
  vi.stubGlobal('localStorage', { getItem: () => null })
  const html = renderToStaticMarkup(<MemoryRouter initialEntries={['/preview/trio?board=2']}><TrioPreviewPage /></MemoryRouter>)
  expect(html.match(/role="gridcell"/g)).toHaveLength(81)
  expect(html.match(/<option /g)).toHaveLength(5)
  expect(html).toContain('href="/how-to-play#trio"')
  expect(html).toContain('Preview solves do not count toward daily stats')
  expect(html).toContain('Board 2 of 5')
  expect(html).toContain('Symbol to place')
  expect(html).toContain('aria-label="Get an explained hint"')
})
