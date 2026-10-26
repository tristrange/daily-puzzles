import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { NurikabePreviewPage } from './NurikabePreviewPage'

afterEach(() => vi.unstubAllGlobals())
it.each([['2', 2, 7], ['3', 3, 7], ['-1', 1, 5], ['1.5', 1, 5], ['no', 1, 5]])('selects preview %s with safe fallback and no daily services', (requested, shown, size) => {
  vi.stubGlobal('localStorage', { getItem: () => null })
  const html = renderToStaticMarkup(<MemoryRouter initialEntries={[`/preview/nurikabe?board=${requested}`]}><NurikabePreviewPage /></MemoryRouter>)
  expect(html.match(/role="gridcell"/g)).toHaveLength(size ** 2)
  expect(html.match(/<option /g)).toHaveLength(3)
  expect(html).toContain(`Preview · Board ${shown} of 3 · ${size}×${size}`)
  expect(html).toContain('href="/how-to-play#nurikabe"')
  expect(html).toContain('Land dots are optional')
  expect(html).toContain('Preview solves do not count toward daily stats, streaks or leaderboards')
  expect(html).toContain('Get an explained hint')
})
