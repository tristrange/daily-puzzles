import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { TentsPreviewPage } from './TentsPreviewPage'

afterEach(() => vi.unstubAllGlobals())
it.each([['3', '3'], ['-1', '1']])('opens the selected preview or a safe fallback (%s)', (requested, shown) => {
  vi.stubGlobal('localStorage', { getItem: () => null })
  const html = renderToStaticMarkup(<MemoryRouter initialEntries={[`/preview/tents?board=${requested}`]}><TentsPreviewPage /></MemoryRouter>)
  expect(html.match(/role="gridcell"/g)).toHaveLength(64)
  expect(html.match(/<option /g)).toHaveLength(3)
  expect(html).toContain(`Preview · Board ${shown} of 3`)
  expect(html).toContain('href="/how-to-play#tents"')
  expect(html).toContain('Preview solves do not count toward daily stats')
  expect(html).toContain('aria-label="Get an explained hint"')
})
