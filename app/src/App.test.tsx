// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from './App'

const provider = vi.hoisted(() => ({ mounts: 0, unmounts: 0 }))

vi.mock('./components/LeaderboardProvider', async () => {
  const { createElement, useEffect } = await import('react')
  return {
    LeaderboardProvider({ children }: { children: ReactNode }) {
      useEffect(() => {
        provider.mounts++
        return () => { provider.unmounts++ }
      }, [])
      return createElement('div', { 'data-provider': 'leaderboard' }, children)
    },
  }
})

vi.mock('./pages/HomePage', async () => {
  const { createElement } = await import('react')
  const { Link } = await import('react-router-dom')
  return {
    HomePage: () => createElement('div', { 'data-page': 'home' },
      createElement(Link, { to: '/archive/2026-10-19' }, 'Puzzle'),
      createElement(Link, { to: '/leaderboards' }, 'Ranks')),
  }
})

vi.mock('./pages/PuzzlePage', async () => {
  const { createElement } = await import('react')
  const { Link } = await import('react-router-dom')
  return {
    PuzzlePage: () => createElement('div', { 'data-page': 'puzzle' },
      createElement(Link, { to: '/leaderboards' }, 'Ranks'),
      createElement(Link, { to: '/' }, 'Home')),
  }
})

vi.mock('./pages/LeaderboardsPage', async () => {
  const { createElement } = await import('react')
  const { Link } = await import('react-router-dom')
  return {
    LeaderboardsPage: () => createElement('div', { 'data-page': 'leaderboards' },
      createElement(Link, { to: '/archive/2026-10-19' }, 'Puzzle'),
      createElement(Link, { to: '/' }, 'Home')),
  }
})

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  provider.mounts = 0
  provider.unmounts = 0
  window.location.hash = '#/'
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  window.location.hash = ''
})

async function click(href: string) {
  const link = container.querySelector<HTMLAnchorElement>(`a[href="${href}"]`)
  if (!link) throw Error(`missing link ${href}`)
  await act(async () => {
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }))
  })
}

it('mounts the leaderboard provider only inside gated routes and keeps it across those routes', async () => {
  await act(async () => root.render(<App />))
  expect(container.querySelector('[data-page="home"]')).not.toBeNull()
  expect(container.querySelector('[data-provider]')).toBeNull()
  expect(provider).toEqual({ mounts: 0, unmounts: 0 })

  await click('#/archive/2026-10-19')
  expect(container.querySelector('[data-page="puzzle"]')?.closest('[data-provider]')).not.toBeNull()
  expect(provider).toEqual({ mounts: 1, unmounts: 0 })

  await click('#/leaderboards')
  expect(container.querySelector('[data-page="leaderboards"]')?.closest('[data-provider]')).not.toBeNull()
  expect(provider).toEqual({ mounts: 1, unmounts: 0 })

  await click('#/')
  expect(container.querySelector('[data-page="home"]')).not.toBeNull()
  expect(container.querySelector('[data-provider]')).toBeNull()
  expect(provider).toEqual({ mounts: 1, unmounts: 1 })

  await click('#/leaderboards')
  expect(container.querySelector('[data-page="leaderboards"]')?.closest('[data-provider]')).not.toBeNull()
  expect(provider).toEqual({ mounts: 2, unmounts: 1 })
})
