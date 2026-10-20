import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { TentsPreviewPage } from './TentsPreviewPage'

afterEach(() => vi.unstubAllGlobals())
it.each([['9', '9', 10], ['6', '6', 8], ['-1', '1', 8]])('opens the selected preview or a safe fallback (%s)', (requested, shown, size) => {
  vi.stubGlobal('localStorage', { getItem: () => null })
  const html = renderToStaticMarkup(<MemoryRouter initialEntries={[`/preview/tents?board=${requested}`]}><TentsPreviewPage /></MemoryRouter>)
  expect(html.match(/role="gridcell"/g)).toHaveLength(size ** 2)
  expect(html.match(/<option /g)).toHaveLength(9)
  expect(html).toContain(`Preview · Board ${shown} of 9 · ${size}×${size}`)
  expect(html).toContain(`aria-label="${size} by ${size} Tents puzzle"`)
  expect(html).toContain('href="/how-to-play#tents"')
  expect(html).toContain('Preview solves do not count toward daily stats')
  expect(html).toContain('aria-label="Get an explained hint"')
})
