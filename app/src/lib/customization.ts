import { PUZZLE_TYPES, type PuzzleType } from '../domain/board'

export const PALETTES = ['classic', 'warm', 'cool', 'forest'] as const
export type Palette = (typeof PALETTES)[number]
export type Customization = { version: 1; palette: Palette; games: PuzzleType[] }
export const CUSTOMIZATION_KEY = 'daily-puzzles:customization'
export const DEFAULT_CUSTOMIZATION: Customization = { version: 1, palette: 'classic', games: ['queens', 'star-battle', 'word-paths', 'trio', 'tents', 'nurikabe', 'train-tracks', 'sudoku', 'killer-sudoku'] }

export function parseCustomization(raw: string | null): Customization {
  try {
    const value: unknown = JSON.parse(raw ?? 'null')
    if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1) return { ...DEFAULT_CUSTOMIZATION, games: [...DEFAULT_CUSTOMIZATION.games] }
    const palette = 'palette' in value ? PALETTES.find(p => p === value.palette) ?? 'classic' : 'classic'
    const input: unknown[] = 'games' in value && Array.isArray(value.games) ? value.games : []
    const games: PuzzleType[] = []
    for (const item of input) {
      const game = PUZZLE_TYPES.find(type => type === item)
      if (game && !games.includes(game)) games.push(game)
    }
    for (const game of [...DEFAULT_CUSTOMIZATION.games, ...PUZZLE_TYPES]) if (!games.includes(game)) games.push(game)
    return { version: 1, palette, games }
  } catch { return { ...DEFAULT_CUSTOMIZATION, games: [...DEFAULT_CUSTOMIZATION.games] } }
}
export function readCustomization(): Customization {
  try { return parseCustomization(localStorage.getItem(CUSTOMIZATION_KEY)) } catch { return parseCustomization(null) }
}
export function saveCustomization(value: Customization): boolean {
  document.documentElement.dataset['palette'] = value.palette
  try { localStorage.setItem(CUSTOMIZATION_KEY, JSON.stringify(value)); return true } catch { return false }
}
export function moveGame(games: PuzzleType[], game: PuzzleType, direction: -1 | 1): PuzzleType[] {
  const index = games.indexOf(game)
  const target = index + direction
  if (index < 0 || target < 0 || target >= games.length) return games
  const result = [...games]
  result.splice(index, 1)
  result.splice(target, 0, game)
  return result
}
