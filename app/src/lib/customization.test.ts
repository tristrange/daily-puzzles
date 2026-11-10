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

it('round trips normalized choices', () => {
  const settings = parseCustomization(JSON.stringify({ version: 1, palette: 'cool', games: ['tents'] }))
  expect(parseCustomization(JSON.stringify(settings))).toEqual(settings)
})

it('keeps text and links legible on palette surfaces in both appearances', async () => {
  const { readFileSync } = await import('node:fs')
  const { contrastRatio } = await import('./colours')
  const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8')
  const base = css.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1] ?? ''
  const read = (block: string, name: string, side: number) => {
    const match = new RegExp(`--${name}:\\s*light-dark\\((#[\\da-f]+),\\s*(#[\\da-f]+)\\)`, 'i').exec(block)
    if (!match) throw new Error(`Missing ${name} colour`)
    return match[side + 1]!
  }
  for (const palette of ['warm', 'cool', 'forest']) {
    const block = css.match(new RegExp(`:root\\[data-palette='${palette}'\\]\\s*\\{([^}]+)\\}`))?.[1] ?? ''
    for (const side of [0, 1]) {
      for (const background of ['bg', 'surface', 'bg-sunken']) {
        for (const foreground of ['text', 'text-h', 'accent']) {
          expect(contrastRatio(read(base, foreground, side), read(block, background, side)), `${palette} ${side} ${foreground} on ${background}`).toBeGreaterThanOrEqual(4.5)
        }
      }
    }
  }
})
