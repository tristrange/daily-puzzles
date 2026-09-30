import { useState } from 'react'
import { applyTheme, readStoredTheme, storeTheme, THEMES, type Theme } from '../lib/theme'

const LABELS: Record<Theme, string> = { system: 'Auto', light: 'Light', dark: 'Dark' }

/**
 * Direct picking rather than a button that cycles: the three options are few
 * enough to show at once, and a player who wants dark should not have to guess
 * how many times to click. `Auto` is the default because following the OS is
 * right for nearly everyone, and it keeps following it afterwards.
 */
export function ThemePicker() {
  const [theme, setTheme] = useState<Theme>(readStoredTheme)
  const choose = (option: Theme) => {
    storeTheme(option)
    setTheme(option)
    // Kept out of an effect: the attribute has to move in the same tick as the
    // click, not one render later, or the click visibly repaints twice.
    applyTheme(option)
  }
  return (
    <div className="theme-picker" role="group" aria-label="Theme">
      {THEMES.map((option) => (
        <button
          key={option}
          type="button"
          className={option === theme ? 'theme-option active' : 'theme-option'}
          aria-pressed={option === theme}
          onClick={() => choose(option)}
        >
          {LABELS[option]}
        </button>
      ))}
    </div>
  )
}
