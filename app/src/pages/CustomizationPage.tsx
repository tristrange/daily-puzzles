import { useRef, useState, type ChangeEvent } from 'react'
import { PUZZLE_TYPE_LABEL, PUZZLE_TYPE_PUBLISHED } from '../domain/games'
import { DEFAULT_CUSTOMIZATION, moveGame, PALETTES, parseCustomization, readCustomization, saveCustomization, type Customization } from '../lib/customization'
import './CustomizationPage.css'

const labels = { classic: 'Classic', warm: 'Warm', cool: 'Cool', forest: 'Forest' }

export function CustomizationPage() {
  const [settings, setSettings] = useState(readCustomization)
  const [notice, setNotice] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const update = (next: Customization) => {
    setSettings(next)
    setNotice(saveCustomization(next) ? 'Saved on this device.' : 'Changes apply for this visit, but could not be saved.')
  }
  const exportSettings = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ kind: 'daily-puzzles-customization', ...settings }, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = 'daily-puzzles-customization.json'
    link.click()
    URL.revokeObjectURL(url)
  }
  const importSettings = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    if (file.size > 65536) { setNotice('That customization file is too large.'); return }
    try {
      const text = await file.text()
      const data: unknown = JSON.parse(text)
      if (!data || typeof data !== 'object' || !('kind' in data) || data.kind !== 'daily-puzzles-customization' || !('version' in data) || data.version !== 1 || !('palette' in data) || !PALETTES.some(p => p === data.palette) || !('games' in data) || !Array.isArray(data.games)) {
        setNotice('That is not a supported customization backup.')
        return
      }
      update(parseCustomization(text))
    } catch { setNotice('That file could not be read as a customization backup.') }
  }
  return <section className="customization">
    <h1 className="page-title">Customization</h1>
    <p>Make Daily Puzzles feel like yours. Your choices are saved on this device.</p>
    <h2>Colour palette</h2>
    <p>Choose a palette for light, dark, or Auto appearance.</p>
    <div className="palette-options" role="group" aria-label="Colour palette">
      {PALETTES.map(palette => <button type="button" key={palette} className="palette-choice" aria-pressed={settings.palette === palette} onClick={() => update({ ...settings, palette })}>
        <span className="palette-preview" data-palette-preview={palette} aria-hidden="true"><i /><i /><i /></span>{labels[palette]}
      </button>)}
    </div>
    <button type="button" className="tool-button" onClick={() => update({ ...settings, palette: 'classic' })}>Restore default palette</button>
    <h2>Today&rsquo;s game order</h2>
    <p>Move a game up or down. Its puzzle choices stay together.</p>
    <ol className="game-order">
      {settings.games.filter(game => PUZZLE_TYPE_PUBLISHED[game]).map((game, index, games) => <li key={game}>
        <span>{PUZZLE_TYPE_LABEL[game]}</span>
        <button type="button" className="tool-button" disabled={index === 0} aria-label={`Move ${PUZZLE_TYPE_LABEL[game]} up`} onClick={() => update({ ...settings, games: moveGame(settings.games, game, -1) })}>↑</button>
        <button type="button" className="tool-button" disabled={index === games.length - 1} aria-label={`Move ${PUZZLE_TYPE_LABEL[game]} down`} onClick={() => update({ ...settings, games: moveGame(settings.games, game, 1) })}>↓</button>
      </li>)}
    </ol>
    <button type="button" className="tool-button" onClick={() => update({ ...settings, games: [...DEFAULT_CUSTOMIZATION.games] })}>Restore default order</button>
    <h2>Transfer preferences</h2>
    <p>Export a file to move these choices to another device. Importing replaces your customization; solve history is unaffected.</p>
    <button type="button" className="tool-button" onClick={exportSettings}>Export customization</button>{' '}
    <button type="button" className="tool-button" onClick={() => fileInput.current?.click()}>Import customization</button>
    <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={importSettings} />
    <h2>Restore defaults</h2>
    <button type="button" className="tool-button" onClick={() => update({ ...DEFAULT_CUSTOMIZATION, games: [...DEFAULT_CUSTOMIZATION.games] })}>Restore all customization</button>
    <p role="status" aria-live="polite">{notice}</p>
  </section>
}
