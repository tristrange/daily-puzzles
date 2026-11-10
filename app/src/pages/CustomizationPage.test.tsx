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
  const root = createRoot(container)
  await act(async () => root.render(<CustomizationPage />))
  const button = (label: string) => [...container.querySelectorAll('button')].find(element => element.getAttribute('aria-label') === label || element.textContent === label)!
  await act(async () => button('Forest').click())
  expect(document.documentElement.dataset['palette']).toBe('forest')
  await act(async () => button('Move Star Battle up').click())
  expect(JSON.parse(localStorage.getItem(CUSTOMIZATION_KEY)!).games.slice(0, 2)).toEqual(['star-battle', 'queens'])
  expect(container.querySelector('.game-order li')?.textContent).toContain('Star Battle')
  await act(async () => button('Restore all customization').click())
  expect(JSON.parse(localStorage.getItem(CUSTOMIZATION_KEY)!).palette).toBe('classic')
  expect(container.querySelector('.game-order li')?.textContent).toContain('Queens')
  await act(async () => root.unmount())
  container.remove()
  localStorage.clear()
})
