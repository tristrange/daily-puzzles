import { describe, expect, it } from 'vitest'
import {
  ARCHIVE_WINDOW_DAYS,
  PuzzleNotFoundError,
  listPublishedPuzzleIds,
  loadPuzzle,
  puzzleUrl,
} from './puzzles'

/** A minimal committed puzzle file. */
function puzzleBody(id: string) {
  return {
    id,
    type: 'queens',
    size: 3,
    seed: 1,
    generatorVersion: 1,
    regions: [0, 0, 1, 0, 1, 1, 0, 0, 2],
  }
}

/** A day with a puzzle, as a static host serves it. */
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/**
 * A day with no puzzle, as a dev or preview server actually answers it: there is
 * no 404 for an unknown path under `public/`, only the SPA shell at 200. Modelled
 * with a real `Response` so that `json()` really throws the way the browser's
 * does, rather than a hand-rolled stub that quietly returns something valid.
 */
const SPA_SHELL = '<!doctype html><html lang="en"><head><script type="module" src="/assets/index.js"></script></head><body></body></html>'

function spaShellResponse(): Response {
  return new Response(SPA_SHELL, { status: 200, headers: { 'content-type': 'text/html' } })
}

/** Serves the given ids as puzzles and the SPA shell for everything else. */
function fetcherFor(published: readonly string[]) {
  return async (url: string) => {
    const id = url.split('/').at(-1)?.replace('.json', '') ?? ''
    return published.includes(id) ? jsonResponse(puzzleBody(id)) : spaShellResponse()
  }
}

describe('puzzleUrl', () => {
  it('points at the committed puzzle file', () => {
    expect(puzzleUrl('2026-09-30')).toContain('/puzzles/2026-09-30.json')
  })
})

describe('loadPuzzle', () => {
  const starBattle = {
    id: '2026-10-04',
    type: 'star-battle',
    size: 8,
    seed: 894026858,
    generatorVersion: 2,
    regions: [
      0, 0, 0, 0, 0, 0, 0, 1,
      0, 0, 0, 2, 1, 1, 1, 1,
      2, 2, 2, 2, 2, 3, 3, 1,
      4, 4, 4, 2, 3, 3, 3, 3,
      4, 4, 4, 4, 4, 4, 5, 3,
      4, 4, 4, 5, 5, 5, 5, 5,
      6, 6, 6, 5, 5, 5, 5, 5,
      6, 6, 6, 7, 7, 7, 7, 5,
    ],
    regionCapacity: [2, 2, 2, 2, 2, 2, 2, 2],
  }

  it('fetches, parses and validates a puzzle file', async () => {
    const fetcher = async () => jsonResponse(puzzleBody('2026-09-30'))
    const puzzle = await loadPuzzle('2026-09-30', fetcher)
    expect(puzzle.id).toBe('2026-09-30')
    expect(puzzle.board.size).toBe(3)
  })

  it('loads a star battle file with its region capacities', async () => {
    const fetcher = async () => jsonResponse(starBattle)
    const puzzle = await loadPuzzle('2026-10-04', fetcher)
    expect(puzzle.puzzleType).toBe('star-battle')
    expect(puzzle.board.regionCapacity).toEqual([2, 2, 2, 2, 2, 2, 2, 2])
  })

  it('rejects ids that are not calendar dates', async () => {
    await expect(loadPuzzle('not-a-date', fetch)).rejects.toBeInstanceOf(PuzzleNotFoundError)
  })

  it('raises PuzzleNotFoundError for missing files', async () => {
    const fetcher = async () => jsonResponse(puzzleBody('2026-09-30'), 404)
    await expect(loadPuzzle('2026-09-30', fetcher)).rejects.toBeInstanceOf(
      PuzzleNotFoundError,
    )
  })

  it('raises PuzzleNotFoundError when the server answers with the SPA shell', async () => {
    // Without this, a missing day reaches the user as "Something went wrong
    // loading that puzzle." instead of the accurate "no puzzle for <date>".
    const fetcher = async () => spaShellResponse()
    await expect(loadPuzzle('2026-09-20', fetcher)).rejects.toBeInstanceOf(
      PuzzleNotFoundError,
    )
  })

  it('raises PuzzleNotFoundError for a file that no longer validates', async () => {
    const fetcher = async () => jsonResponse({ id: '2026-09-20', type: 'nope' })
    await expect(loadPuzzle('2026-09-20', fetcher)).rejects.toBeInstanceOf(
      PuzzleNotFoundError,
    )
  })
})

describe('listPublishedPuzzleIds', () => {
  const published = ['2026-10-03', '2026-10-01', '2026-09-28']

  it('returns only days with a puzzle file, newest first', async () => {
    const found = await listPublishedPuzzleIds('2026-10-03', fetcherFor(published))
    expect(found).toEqual(published)
  })

  it('probes a bounded recent window', async () => {
    const probes: string[] = []
    const probeFetcher = async (url: string) => {
      probes.push(url.split('/').at(-1) ?? '')
      return spaShellResponse()
    }
    await listPublishedPuzzleIds('2026-10-03', probeFetcher)
    expect(probes).toHaveLength(ARCHIVE_WINDOW_DAYS)
  })

  it('ignores days that answer 200 with the SPA shell rather than a puzzle', async () => {
    // The bug this file exists for: every day in the window "responds", so
    // `response.ok` alone listed a month of days that do not exist.
    let answeredOk = 0
    const countingFetcher = async (url: string) => {
      const response = await fetcherFor(published)(url)
      if (response.ok) answeredOk += 1
      return response
    }
    const found = await listPublishedPuzzleIds('2026-10-03', countingFetcher)
    expect(answeredOk).toBe(ARCHIVE_WINDOW_DAYS)
    expect(found).toEqual(published)
  })

  it('ignores a day whose file no longer validates', async () => {
    const broken = async (url: string) => {
      const id = url.split('/').at(-1)?.replace('.json', '') ?? ''
      return id === '2026-10-01'
        ? jsonResponse({ id, type: 'nope' })
        : fetcherFor(published)(url)
    }
    const found = await listPublishedPuzzleIds('2026-10-03', broken)
    expect(found).toEqual(['2026-10-03', '2026-09-28'])
  })

  it('returns nothing when no day has a puzzle', async () => {
    expect(await listPublishedPuzzleIds('2026-10-03', fetcherFor([]))).toEqual([])
  })
})
