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

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
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

it('does not play when an already-solved page is restored', async () => {
  await render(true)
  expect(panel()).not.toBeNull()
  expect(panel()?.classList.contains('just-solved')).toBe(false)
})
