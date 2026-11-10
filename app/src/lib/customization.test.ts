import { describe, expect, it } from 'vitest'
import { parseCustomization, moveGame, DEFAULT_CUSTOMIZATION } from './customization'

describe('customization', () => {
  it('falls back for invalid and future data', () => {
    expect(parseCustomization(null)).toEqual(DEFAULT_CUSTOMIZATION)
    expect(parseCustomization('{')).toEqual(DEFAULT_CUSTOMIZATION)
    expect(parseCustomization('{"version":2}')).toEqual(DEFAULT_CUSTOMIZATION)
  })
  it('normalizes missing, duplicate and unknown games without losing new games', () => {
    const result = parseCustomization(JSON.stringify({ version: 1, palette: 'forest', games: ['sudoku', 'sudoku', 'unknown'] }))
    expect(result.palette).toBe('forest')
    expect(result.games[0]).toBe('sudoku')
    expect(new Set(result.games).size).toBe(DEFAULT_CUSTOMIZATION.games.length)
  })
  it('moves a game without changing the others', () => {
    expect(moveGame(['queens', 'sudoku', 'tents'], 'sudoku', -1)).toEqual(['sudoku', 'queens', 'tents'])
    expect(moveGame(['queens', 'sudoku'], 'queens', -1)).toEqual(['queens', 'sudoku'])
  })
})

it('round trips stored choices without changing other local data', () => {
  const settings = parseCustomization(JSON.stringify({ version: 1, palette: 'cool', games: ['tents'] }))
  expect(parseCustomization(JSON.stringify(settings))).toEqual(settings)
})
