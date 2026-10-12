import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ThemePicker } from './ThemePicker'

afterEach(() => vi.unstubAllGlobals())

describe('ThemePicker', () => {
  it('defaults to Auto and offers explicit Light and Dark choices', () => {
    vi.stubGlobal('localStorage', { getItem: () => null })
    const html = renderToStaticMarkup(<ThemePicker />)
    expect(html).toContain('aria-pressed="true">Auto</button>')
    expect(html).toContain('aria-pressed="false">Light</button>')
    expect(html).toContain('aria-pressed="false">Dark</button>')
  })

  it('honors a saved Dark override', () => {
    vi.stubGlobal('localStorage', { getItem: () => 'dark' })
    const html = renderToStaticMarkup(<ThemePicker />)
    expect(html).toContain('aria-pressed="true">Dark</button>')
    expect(html).toContain('aria-pressed="false">Auto</button>')
  })

  it('offers Auto when browser storage is blocked', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('Storage blocked') } })
    expect(renderToStaticMarkup(<ThemePicker />)).toContain('aria-pressed="true">Auto</button>')
  })
})
