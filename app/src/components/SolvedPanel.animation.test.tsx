// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SolvedPanel, type SolvedPanelProps } from './SolvedPanel'

const base: SolvedPanelProps = {
  solved: false,
  firstSolve: null,
  streak: 1,
  copied: 'idle',
  shareText: null,
  onShare: () => {},
}

let container: HTMLDivElement
let root: Root
let scrollIntoView: ReturnType<typeof vi.fn<Element['scrollIntoView']>>

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  scrollIntoView = vi.fn<Element['scrollIntoView']>()
  // jsdom has no scrolling, and the banner's arrival is only visible if the
  // page brings it on screen, so the call itself is the behaviour under test.
  Element.prototype.scrollIntoView = scrollIntoView
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

async function render(solved: boolean) {
  await act(async () => root.render(
    <MemoryRouter><SolvedPanel {...base} solved={solved} /></MemoryRouter>,
  ))
}

const panel = () => container.querySelector('.solved-panel')

it('plays on a new solve and again on a replay', async () => {
  await render(false)
  expect(panel()).toBeNull()
  await render(true)
  expect(panel()?.classList.contains('just-solved')).toBe(true)
  await render(false)
  expect(panel()).toBeNull()
  await render(true)
  expect(panel()?.classList.contains('just-solved')).toBe(true)
})

it('brings a new solve into view, once per solve', async () => {
  await render(false)
  expect(scrollIntoView).not.toHaveBeenCalled()
  expect(container.querySelector('.confetti')).toBeNull()
  await render(true)
  expect(scrollIntoView).toHaveBeenCalledTimes(1)
  expect(scrollIntoView.mock.instances[0]).toBe(panel()?.querySelector('.solved-banner'))
  expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })
  expect(container.querySelector('.confetti')?.children).toHaveLength(90)
  await render(false)
  await render(true)
  expect(scrollIntoView).toHaveBeenCalledTimes(2)
})

it('does not play when an already-solved page is restored', async () => {
  await render(true)
  expect(panel()).not.toBeNull()
  expect(panel()?.classList.contains('just-solved')).toBe(false)
  expect(scrollIntoView).not.toHaveBeenCalled()
  expect(container.querySelector('.confetti')).toBeNull()
})
