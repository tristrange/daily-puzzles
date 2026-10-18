import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { expect, it } from 'vitest'
import { PUZZLE_TYPES } from '../domain/board'
import { RulesPage } from './RulesPage'

it('links every game to its rules and retains the existing notes anchors', () => {
  const html = renderToStaticMarkup(<MemoryRouter><RulesPage /></MemoryRouter>)
  for (const type of PUZZLE_TYPES) {
    expect(html).toContain(`href="/how-to-play#${type}"`)
    expect(html).toContain(`id="${type}"`)
  }
  for (const id of ['controls', 'crosses', 'notes']) expect(html).toContain(`id="${id}"`)
})
