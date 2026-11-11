// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { EnclosureGrid } from '../domain/enclosure'
import { EnclosureBoard } from './EnclosureBoard'

const grid = new EnclosureGrid(3, [1], 4, 3)
let container: HTMLDivElement, root: Root
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  container = document.createElement('div'); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove() })
const cell = (index: number) => container.querySelector<HTMLButtonElement>(`[data-cell="${index}"]`)!

it('describes terrain, walls and the reachable enclosure', async () => {
  await act(async () => root.render(<EnclosureBoard grid={grid} walls={[0]} reachable={[3, 4]} enclosed instructionsId="help" onToggle={() => {}} />))
  expect(container.querySelector('[role="grid"]')?.getAttribute('aria-describedby')).toBe('help')
  expect(container.querySelectorAll('[role="row"]')).toHaveLength(3)
  expect(cell(0).getAttribute('aria-label')).toMatch(/wall/i)
  expect(cell(1).getAttribute('aria-label')).toMatch(/water/i)
  expect(cell(4).getAttribute('aria-label')).toMatch(/horse.*reachable/i)
  expect(cell(3).dataset['reachable']).toBe('true')
  expect(cell(1).getAttribute('aria-readonly')).toBe('true')
  expect(cell(4).getAttribute('aria-readonly')).toBe('true')
})

it('moves focus by row and keeps fixed cells navigable', async () => {
  await act(async () => root.render(<EnclosureBoard grid={grid} walls={[]} reachable={[]} enclosed={false} instructionsId="help" onToggle={() => {}} />))
  await act(async () => cell(0).focus())
  for (const [key, destination] of [['ArrowRight', 1], ['ArrowDown', 4], ['End', 5], ['Home', 3], ['ArrowUp', 0]] as const) {
    await act(async () => document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })))
    expect(document.activeElement).toBe(cell(destination))
    expect(cell(destination).tabIndex).toBe(0)
  }
})

it('uses native button clicks once and never toggles fixed terrain', async () => {
  const toggle = vi.fn()
  await act(async () => root.render(<EnclosureBoard grid={grid} walls={[]} reachable={[]} enclosed={false} instructionsId="help" onToggle={toggle} />))
  for (const key of ['Enter', ' ']) {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
    await act(async () => cell(0).dispatchEvent(event))
    expect(event.defaultPrevented).toBe(false)
    // jsdom does not synthesize the browser's keyboard-generated click.
    await act(async () => cell(0).click())
  }
  await act(async () => { cell(1).click(); cell(4).click() })
  expect(toggle.mock.calls).toEqual([[0], [0]])
})

it('exposes a separately labelled read-only solution while keeping cells navigable', async () => {
  await act(async () => root.render(<EnclosureBoard grid={grid} walls={[0]} reachable={[4]} enclosed instructionsId="help" readOnly label="Optimal enclosure solution" />))
  expect(container.querySelector('[role="grid"]')?.getAttribute('aria-label')).toBe('Optimal enclosure solution')
  expect(cell(0).getAttribute('aria-readonly')).toBe('true')
  expect(cell(2).getAttribute('aria-readonly')).toBe('true')
  await act(async () => { cell(2).focus(); cell(2).click() })
  expect(cell(2).dataset['wall']).toBe('false')
  expect(document.activeElement).toBe(cell(2))
})
