/**
 * Theme resolution, minus the DOM. The point of these tests is that `system`
 * really does survive a round trip and that a bad stored value cannot leave the
 * app in a theme it does not have colours for.
 */

import { describe, expect, it } from 'vitest'
import { parseTheme, THEME_STORAGE_KEY, THEMES } from './theme'

describe('themes', () => {
  it('offers system, light and dark, in that order', () => {
    expect(THEMES).toEqual(['system', 'light', 'dark'])
  })

  it('parses each choice back to itself', () => {
    for (const theme of THEMES) {
      expect(parseTheme(theme)).toBe(theme)
    }
  })

  it('falls back to system for anything else', () => {
    for (const value of [null, undefined, '', 'Dark', 'DARK', 'dark ', 'solarized', '{}']) {
      expect(parseTheme(value)).toBe('system')
    }
  })

  it('keys storage under a namespaced name', () => {
    // The inline script in index.html hard-codes this string, so a rename there
    // without a change here would silently drop every player's choice.
    expect(THEME_STORAGE_KEY).toBe('daily-puzzles:theme')
  })
})
