// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it } from 'vitest'
import { CustomizationPage } from './CustomizationPage'
import { CUSTOMIZATION_KEY } from '../lib/customization'

it('saves palette and game order using buttons, and restores both', async () => {
  localStorage.clear()
  const container = document.createElement('div')
  document.body.append(container)
  let root = createRoot(container)
  await act(async () => root.render(<CustomizationPage />))
  const button = (label: string) => [...container.querySelectorAll('button')].find(element => element.getAttribute('aria-label') === label || element.textContent === label)!
  await act(async () => button('Forest').click())
  expect(document.documentElement.dataset['palette']).toBe('forest')
  await act(async () => button('Move Star Battle up').click())
  expect(JSON.parse(localStorage.getItem(CUSTOMIZATION_KEY)!).games.slice(0, 2)).toEqual(['star-battle', 'queens'])
  expect(container.querySelector('.game-order li')?.textContent).toContain('Star Battle')
  await act(async () => root.unmount())
  root = createRoot(container)
  await act(async () => root.render(<CustomizationPage />))
  expect(button('Forest').getAttribute('aria-pressed')).toBe('true')
  expect(container.querySelector('.game-order li')?.textContent).toContain('Star Battle')
  await act(async () => button('Restore all customization').click())
  expect(JSON.parse(localStorage.getItem(CUSTOMIZATION_KEY)!).palette).toBe('classic')
  expect(container.querySelector('.game-order li')?.textContent).toContain('Queens')
  await act(async () => root.unmount())
  container.remove()
  localStorage.clear()
})

it('imports customization without touching solve history and rejects a stats backup', async () => {
  localStorage.clear()
  const stats = '[{"id":"2026-11-10","elapsedMs":1234}]'
  localStorage.setItem('daily-puzzles:stats', stats)
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  await act(async () => root.render(<CustomizationPage />))
  const input = container.querySelector('input[type=file]')!
  const importText = async (text: string) => {
    const file = new File([text], 'backup.json', { type: 'application/json' })
    Object.defineProperty(file, 'text', { value: async () => text })
    Object.defineProperty(input, 'files', { configurable: true, value: [file] })
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })))
  }
  await importText(JSON.stringify({ kind: 'daily-puzzles-customization', version: 1, palette: 'cool', games: ['tents'] }))
  expect(JSON.parse(localStorage.getItem(CUSTOMIZATION_KEY)!).palette).toBe('cool')
  expect(container.querySelector('.game-order li')?.textContent).toContain('Tents')
  const saved = localStorage.getItem(CUSTOMIZATION_KEY)
  await importText(stats)
  expect(container.textContent).toContain('not a supported customization backup')
  expect(localStorage.getItem(CUSTOMIZATION_KEY)).toBe(saved)
  expect(localStorage.getItem('daily-puzzles:stats')).toBe(stats)
  await act(async () => root.unmount())
  container.remove()
  localStorage.clear()
})
