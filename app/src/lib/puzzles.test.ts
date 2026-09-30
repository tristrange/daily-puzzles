import { describe, expect, it } from 'vitest'
import {
  ARCHIVE_WINDOW_DAYS,
  PuzzleNotFoundError,
  listPublishedPuzzleIds,
  loadPuzzle,
  puzzleUrl,
} from './puzzles'

function stubResponse(body: unknown, ok = true): Response {
  return {
    ok,
    json: async () => body,
  } as Response
}

describe('puzzleUrl', () => {
  it('points at the committed puzzle file', () => {
    expect(puzzleUrl('2026-09-30')).toContain('/puzzles/2026-09-30.json')
  })
})

describe('loadPuzzle', () => {
  const valid = {
    id: '2026-09-30',
    type: 'queens',
    size: 3,
    seed: 1,
    generatorVersion: 1,
    regions: [0, 0, 1, 0, 1, 1, 0, 0, 2],
  }

  it('fetches, parses and validates a puzzle file', async () => {
    const fetcher = async () => stubResponse(valid)
    const puzzle = await loadPuzzle('2026-09-30', fetcher)
    expect(puzzle.id).toBe('2026-09-30')
    expect(puzzle.board.size).toBe(3)
  })

  it('rejects ids that are not calendar dates', async () => {
    await expect(loadPuzzle('not-a-date', fetch)).rejects.toBeInstanceOf(PuzzleNotFoundError)
  })

  it('raises PuzzleNotFoundError for missing files', async () => {
    const fetcher = async () => stubResponse({}, false)
    await expect(loadPuzzle('2026-09-30', fetcher)).rejects.toBeInstanceOf(
      PuzzleNotFoundError,
    )
  })
})

describe('listPublishedPuzzleIds', () => {
  const files = new Map<string, boolean>([
    ['2026-10-03', true],
    ['2026-10-01', true],
    ['2026-09-28', true],
  ])

  const fetcher = async (url: string) => {
    const id = url.split('/').at(-1)?.replace('.json', '') ?? ''
    return stubResponse({}, files.get(id) === true)
  }

  it('returns only days with a puzzle file, newest first', async () => {
    const published = await listPublishedPuzzleIds('2026-10-03', fetcher)
    expect(published).toEqual(['2026-10-03', '2026-10-01', '2026-09-28'])
  })

  it('probes a bounded recent window', async () => {
    const probes: string[] = []
    const probeFetcher = async (url: string) => {
      probes.push(url.split('/').at(-1) ?? '')
      return stubResponse({}, false)
    }
    await listPublishedPuzzleIds('2026-10-03', probeFetcher)
    expect(probes).toHaveLength(ARCHIVE_WINDOW_DAYS)
  })
})