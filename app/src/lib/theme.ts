/**
 * The theme choice: follow the OS, or pin light or dark.
 *
 * What is stored is the *choice*, not the resolved value. `system` stays
 * `system`, so a player whose OS flips at dusk — or whose schedule does — keeps
 * being followed without a single line of JavaScript running. Resolution is
 * left to the stylesheet: an explicit `data-theme` of `light` or `dark` sets
 * `color-scheme` on the root, and every colour in the app is a `light-dark()`
 * pair that resolves against it. One set of values, no dark media query to keep
 * in step with a dark override, and no listener for OS changes.
 *
 * The alternative — a media query plus a class that overrides it — needs the
 * dark values written twice, and the two copies are exactly the kind of thing
 * that silently drifts apart.
 */

export const THEMES = ['system', 'light', 'dark'] as const

export type Theme = (typeof THEMES)[number]

/**
 * Where the choice is kept between visits. Also read by the inline script in
 * `index.html`, which applies it before the first paint; keep the two in step.
 */
export const THEME_STORAGE_KEY = 'daily-puzzles:theme'

/**
 * Anything unrecognised — absent, hand-edited, left over from a future version —
 * is `system`, which is the safe answer: it is what the page already did.
 */
export function parseTheme(value: string | null | undefined): Theme {
  return THEMES.find((theme) => theme === value) ?? 'system'
}

/**
 * The stored choice, or `system`. Private browsing and blocked storage throw on
 * *access*, not just on write, so this has to be defensive to be worth having.
 */
export function readStoredTheme(): Theme {
  try {
    return parseTheme(localStorage.getItem(THEME_STORAGE_KEY))
  } catch {
    return 'system'
  }
}

export function storeTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // A choice that lasts until reload is better than a page that breaks.
  }
}

/** Put the choice where the stylesheet can see it. */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset['theme'] = theme
}
