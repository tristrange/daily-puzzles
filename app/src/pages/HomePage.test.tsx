import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import small from '../../../conformance/id-cases/tracks-small.accept.json'
import medium from '../../../conformance/id-cases/tracks-medium.accept.json'
import words from '../../../conformance/word-paths/2026-10-14-words.json'
import tents from '../../../conformance/schema-cases/tents.accept.json'
import trio from '../../../conformance/schema-cases/trio.accept.json'
import large from '../../../conformance/id-cases/tracks-large.accept.json'
import { parsePuzzle } from '../domain/puzzle'
import type { ProbedPuzzle } from '../lib/puzzles'
import { TodayCards } from './HomePage'

const probes: ProbedPuzzle[] = [small, medium, large].map((data) => ({
  id: data.id, puzzle: parsePuzzle(data),
}))

function render(entries = probes, solved: ReadonlySet<string> = new Set()): string {
  return renderToStaticMarkup(
    <MemoryRouter><TodayCards probes={entries} solved={solved} /></MemoryRouter>,
  )
}

describe('daily Train Tracks choices', () => {
  it('puts all three named links inside one Train Tracks card', () => {
    const html = render()
    expect(html.match(/game-card game-train-tracks/g)).toHaveLength(1)
    for (const [name, label, side] of [['small', 'Small', 8], ['medium', 'Medium', 10], ['large', 'Large', 12]]) {
      expect(html).toContain(`href="/archive/2026-10-17-tracks-${name}"`)
      expect(html).toContain(label)
      expect(html).toContain(`${side}×${side}`)
    }
  })

  it('marks only the solved variant and names its replay action', () => {
    const html = render(probes, new Set([small.id]))
    expect(html).toContain('aria-label="Play Train Tracks Small again"')
    expect(html).toContain('aria-label="Play Train Tracks Medium"')
    expect(html.match(/Solved/g)).toHaveLength(1)
  })

  it('keeps the other choices when Medium is unpublished', () => {
    const html = render(probes.map((probe) => probe.id === medium.id ? { ...probe, puzzle: null } : probe))
    expect(html).toContain('Medium')
    expect(html).toContain('Not published yet.')
    expect(html).not.toContain(`href="/archive/${medium.id}"`)
    expect(html).toContain(`href="/archive/${small.id}"`)
    expect(html).toContain(`href="/archive/${large.id}"`)
  })

  it('retains an ordinary card for a legacy slot without inventing a size name', () => {
    const html = render([{ id: '2026-10-16-tracks', puzzle: null }])
    expect(html).toContain('Train Tracks')
    expect(html).toContain('Not published yet.')
    expect(html).not.toContain('Small')
  })
})


it('offers Word Paths as its own daily game without disturbing the three track choices', () => {
  const puzzle = parsePuzzle({ ...words, id: '2026-10-15-words' })
  const html = render([...probes, { id: puzzle.id, puzzle }], new Set([puzzle.id]))
  expect(html).toContain('game-word-paths')
  expect(html).toContain('aria-label="Play Word Paths again"')
  expect(html).toContain('href="/archive/2026-10-15-words"')
  expect(html.match(/aria-label="Play Train Tracks/g)).toHaveLength(3)
})


it('offers daily Trio with a normal play link and honest publication states', () => {
  const puzzle = parsePuzzle(trio)
  const html = render([{ id: puzzle.id, puzzle }], new Set([puzzle.id]))
  expect(html).toContain('game-trio')
  expect(html).toContain('aria-label="Play Trio again"')
  expect(html).toContain(`href="/archive/${puzzle.id}"`)
  expect(html).not.toContain('/preview/trio')
  expect(html).not.toContain('Easy')
  const unpublished = render([{ id: puzzle.id, puzzle: null }])
  expect(unpublished).toContain('Trio')
  expect(unpublished).toContain('Not published yet.')
})

it.each([small.id, words.id, trio.id])('distinguishes an unavailable download from an unpublished %s', (id) => {
  const html = render([{ id, puzzle: null, unavailable: true }])
  expect(html).toContain('Not saved — connect to load.')
  expect(html).not.toContain('Not published yet.')
})

it('offers daily Tents with a normal play link and honest publication states', () => {
  const puzzle = parsePuzzle(tents)
  const html = render([{ id: puzzle.id, puzzle }], new Set([puzzle.id]))
  expect(html).toContain('game-tents')
  expect(html).toContain('aria-label="Play Tents again"')
  expect(html).toContain(`href="/archive/${puzzle.id}"`)
  expect(html).not.toContain('/preview/tents')
  expect(html).not.toContain('Easy')
  const unpublished = render([{ id: puzzle.id, puzzle: null }])
  expect(unpublished).toContain('Tents')
  expect(unpublished).toContain('Not published yet.')
})
