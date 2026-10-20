import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { expect, it } from 'vitest'
import { PuzzlePage } from './PuzzlePage'

it('allows daily Word Paths to load through the ordinary puzzle route', () => {
  const html = renderToStaticMarkup(
    <MemoryRouter initialEntries={['/puzzle/2026-10-15-words']}>
      <Routes><Route path="/puzzle/:id" element={<PuzzlePage />} /></Routes>
    </MemoryRouter>,
  )
  expect(html).not.toContain('playing screen is not ready yet')
  expect(html).toContain('Loading puzzle')
  expect(html).toContain('href="/archive?game=word-paths"')
})

it('returns to the archive window the puzzle was opened from', () => {
  const html = renderToStaticMarkup(
    <MemoryRouter initialEntries={['/puzzle/2026-10-15-words?page=2']}>
      <Routes><Route path="/puzzle/:id" element={<PuzzlePage />} /></Routes>
    </MemoryRouter>,
  )
  expect(html).toContain('href="/archive?game=word-paths&amp;page=2"')
})
