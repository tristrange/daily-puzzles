import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { expect, it } from 'vitest'
import { PuzzlePage } from './PuzzlePage'

it('keeps an unpublished Word Paths URL out of the marks playing screen', () => {
  const html = renderToStaticMarkup(
    <MemoryRouter initialEntries={['/puzzle/2026-10-14-words']}>
      <Routes><Route path="/puzzle/:id" element={<PuzzlePage />} /></Routes>
    </MemoryRouter>,
  )
  expect(html).toContain('Word Paths')
  expect(html).toContain('playing screen is not ready yet')
  expect(html).not.toContain('Loading puzzle')
})
