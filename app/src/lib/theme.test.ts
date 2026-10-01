/**
 * Theme resolution, minus the DOM, plus the one property of a theme that a unit
 * test can actually prove: that its text is legible. The point of these tests is
 * that `system` really does survive a round trip, that a bad stored value cannot
 * leave the app in a theme it does not have colours for, and that neither theme
 * has a foreground/background pair that fails WCAG AA.
 */

import { readFileSync } from 'node:fs'
import { contrastRatio } from './contrast'
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

/**
 * Contrast has to be read out of the stylesheet, because that is where the
 * colours live — nothing in TypeScript knows what `--accent` is. Worth the
 * parsing: the accent originally shipped as `#aa3bff`, which is a fine purple on
 * a border and a 4.39:1 link on white, and nothing else in the app could see it.
 */
const STYLESHEET = new URL('../index.css', import.meta.url).pathname
const APP_CSS = new URL('../App.css', import.meta.url).pathname

const CHANNEL = '#[0-9a-f]{3,8}|rgba?\\([^)]*\\)'

/** Parse a hex or `rgb()`/`rgba()` literal to channels plus alpha. */
function parseLiteral(value: string): [number, number, number, number] {
  const rgba = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?/i.exec(value)
  if (rgba !== null) {
    return [
      Number(rgba[1]),
      Number(rgba[2]),
      Number(rgba[3]),
      rgba[4] === undefined ? 1 : Number(rgba[4]),
    ]
  }
  const full = value.length === 4 ? `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}` : value
  const at = (offset: number) => Number.parseInt(full.slice(offset, offset + 2), 16)
  // Alpha is always present, so compositing never multiplies by `undefined`.
  return [at(1), at(3), at(5), 1]
}

/** `light-dark(#fff, #16171d)`, `light-dark(rgba(..), rgba(..))` or a bare value. */
function readColour(name: string, side: 'light' | 'dark'): [number, number, number, number] {
  const css = readFileSync(STYLESHEET, 'utf8')
  const declaration = new RegExp(`--${name}:\\s*([^;]+);`).exec(css)?.[1]?.trim()
  if (declaration === undefined) throw new Error(`index.css no longer declares --${name}`)
  const pair = new RegExp(`^light-dark\\(\\s*(${CHANNEL})\\s*,\\s*(${CHANNEL})\\s*\\)$`, 'i').exec(declaration)
  return parseLiteral(pair === null ? declaration : side === 'light' ? (pair[1] as string) : (pair[2] as string))
}

/** Drop the alpha channel, for colours that are used opaque. */
function opaque(colour: [number, number, number, number]): [number, number, number] {
  const [r, g, b] = colour
  return [r, g, b]
}

/** Composite a translucent colour over an opaque one. */
function flatten(
  colour: [number, number, number, number],
  page: [number, number, number],
): [number, number, number] {
  const alpha = colour[3]
  const composited: [number, number, number] = [0, 0, 0]
  for (const channel of [0, 1, 2] as const) {
    composited[channel] = Math.round(colour[channel] * alpha + page[channel] * (1 - alpha))
  }
  return composited
}

/**
 * The shared WCAG arithmetic works in hex; these tests hold the channels they
 * have already composited over a background, so they hand it a throwaway hex.
 */
function contrast(a: [number, number, number], b: [number, number, number]): number {
  const toHex = (colour: [number, number, number]) =>
    `#${colour.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
  return contrastRatio(toHex(a), toHex(b))
}

const TEXT_MINIMUM = 4.5

/**
 * The foreground and background `.theme-option.active` actually paints with,
 * with `var(--x)` references resolved through the `:root` palette and
 * translucency composited onto the page.
 */
function selectedLabel(
  side: 'light' | 'dark',
  page: [number, number, number],
): { foreground: [number, number, number]; background: [number, number, number] } {
  const css = readFileSync(APP_CSS, 'utf8')
  // Slice out the whole `.theme-option` rule, nested `&` blocks and all, by
  // stopping at the next top-level selector.
  const start = css.indexOf('.theme-option')
  if (start === -1) throw new Error('App.css no longer styles .theme-option')
  const next = css.indexOf('\n.', start + 1)
  const rule = css.slice(start, next === -1 ? undefined : next)
  const active = /&\.active\s*\{([^}]*)\}/.exec(rule)?.[1]
  if (active === undefined) throw new Error('.theme-option no longer has an &.active state')

  const resolve = (property: string): [number, number, number] => {
    const value = new RegExp(`(?:^|\\s)${property}:\\s*([^;]+);`).exec(active)?.[1]?.trim()
    if (value === undefined) throw new Error(`.theme-option.active no longer sets ${property}`)
    const variable = /^var\(--([\w-]+)\)$/.exec(value)
    return flatten(variable === null ? parseLiteral(value) : readColour(variable[1] as string, side), page)
  }
  return { foreground: resolve('color'), background: resolve('background') }
}

describe.each(['light', 'dark'] as const)('the %s theme', (side) => {
  const page = opaque(readColour('bg', side))

  it('has body text that clears AA', () => {
    expect(contrast(opaque(readColour('text', side)), page)).toBeGreaterThanOrEqual(TEXT_MINIMUM)
  })

  it('has headings that clears AA', () => {
    expect(contrast(opaque(readColour('text-h', side)), page)).toBeGreaterThanOrEqual(TEXT_MINIMUM)
  })

  it('has an accent that clears AA as link and label text', () => {
    // The nav's active link, the archive links and the mark button put this on
    // the bare page background at 18px, so it is body-size text rather than a
    // decorative fill. That also covers the focus ring, whose 3:1 non-text
    // minimum is the weaker of the two. `--border` is deliberately not
    // asserted: it draws decorative hairlines (header, footer, board frame),
    // which WCAG 1.4.11 exempts, and the picker's own frame is not its
    // selected state.
    expect(contrast(opaque(readColour('accent', side)), page)).toBeGreaterThanOrEqual(TEXT_MINIMUM)
  })

  it('has a selected control label that clears AA on its own tinted background', () => {
    // The picker puts a 50% accent wash behind the selected label and uses
    // --text-h over it. Accent over that wash was 2.1:1 in light mode, and the
    // selected state is exactly where a weak pairing hides best.
    const wash = flatten(readColour('accent-border', side), page)
    expect(contrast(opaque(readColour('text-h', side)), wash)).toBeGreaterThanOrEqual(TEXT_MINIMUM)
  })

  it('renders the selected theme label legibly, as App.css actually writes it', () => {
    // The pairings above only prove the palette *can* support them; this reads
    // the declarations `.theme-option.active` really uses, so putting the accent
    // back on the accent wash fails here rather than in a review. Reviewers
    // found that one; a palette assertion alone would not have stopped it.
    const { foreground, background } = selectedLabel(side, page)
    expect(
      contrast(foreground, background),
      `.theme-option.active resolves to ${foreground.join(',')} on ${background.join(',')} in ${side} mode`,
    ).toBeGreaterThanOrEqual(TEXT_MINIMUM)
  })
})
