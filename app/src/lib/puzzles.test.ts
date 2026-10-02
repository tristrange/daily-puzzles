import { describe, expect, it } from 'vitest'
import {
  ARCHIVE_WINDOW_DAYS,
  PuzzleNotFoundError,
  listPublishedPuzzles,
  loadPuzzle,
  probePuzzles,
  puzzleUrl,
} from './puzzles'

/**
 * A minimal committed puzzle file, shaped for the id given.
 *
 * No `difficulty` by default, which is what every file published before the
 * weekly ramp looks like. Pass one to model a ramped file.
 */
function puzzleBody(id: string, difficulty?: number) {
  const star = id.endsWith('-star')
  return {
    id,
    type: star ? 'star-battle' : 'queens',
    size: 3,
    seed: 1,
    generatorVersion: 1,
    regions: [0, 0, 1, 0, 1, 1, 0, 0, 2],
    ...(star ? { regionCapacity: [1, 1, 1] } : {}),
    ...(difficulty === undefined ? {} : { difficulty }),
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

describe('listPublishedPuzzles', () => {
  const published = ['2026-10-03', '2026-10-01', '2026-09-28']
  const queens = published.map((id) => ({ id, type: 'queens', difficulty: null }))

  it('returns only days with a puzzle file, newest first', async () => {
    const found = await listPublishedPuzzles('2026-10-03', fetcherFor(published))
    expect(found).toEqual(queens)
  })

  it('reports the family the file declares, not the one its id suggests', async () => {
    // A file committed with a companion's name but the wrong family must show up
    // as what it is, or the archive would mislabel it.
    const mislabelled = async (url: string) => {
      const id = url.split('/').at(-1)?.replace('.json', '') ?? ''
      return id === '2026-10-03-star'
        ? jsonResponse({ ...puzzleBody(id), type: 'queens', regionCapacity: undefined })
        : spaShellResponse()
    }

    const found = await listPublishedPuzzles('2026-10-03', mislabelled)

    expect(found).toEqual([{ id: '2026-10-03-star', type: 'queens', difficulty: null }])
  })

  it('probes a bounded recent window', async () => {
    const probes: string[] = []
    const probeFetcher = async (url: string) => {
      probes.push(url.split('/').at(-1) ?? '')
      return spaShellResponse()
    }
    await listPublishedPuzzles('2026-10-03', probeFetcher)
    // Both ids of every day in the window: a companion that is not published
    // yet has to be asked for before it can be reported as absent.
    expect(probes).toHaveLength(ARCHIVE_WINDOW_DAYS * 2)
    expect(probes).toContain('2026-10-03.json')
    expect(probes).toContain('2026-10-03-star.json')
  })

  it('lists both puzzles of a day, the Queens one first', async () => {
    const both = ['2026-10-03', '2026-10-03-star', '2026-10-02']

    const found = await listPublishedPuzzles('2026-10-03', fetcherFor(both))

    expect(found).toEqual([
      { id: '2026-10-03', type: 'queens', difficulty: null },
      { id: '2026-10-03-star', type: 'star-battle', difficulty: null },
      { id: '2026-10-02', type: 'queens', difficulty: null },
    ])
  })

  it('omits a companion that has not been published', async () => {
    // Days before companions existed have only the Queens puzzle, so the missing
    // one must be absent from the listing rather than listed as broken.
    const found = await listPublishedPuzzles('2026-10-03', fetcherFor(['2026-10-03']))

    expect(found).toEqual([{ id: '2026-10-03', type: 'queens', difficulty: null }])
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
    const found = await listPublishedPuzzles('2026-10-03', countingFetcher)
    expect(answeredOk).toBe(ARCHIVE_WINDOW_DAYS * 2)
    expect(found).toEqual(queens)
  })

  it('ignores a day whose file no longer validates', async () => {
    const broken = async (url: string) => {
      const id = url.split('/').at(-1)?.replace('.json', '') ?? ''
      return id === '2026-10-01'
        ? jsonResponse({ id, type: 'nope' })
        : fetcherFor(published)(url)
    }
    const found = await listPublishedPuzzles('2026-10-03', broken)
    expect(found).toEqual([
      { id: '2026-10-03', type: 'queens', difficulty: null },
      { id: '2026-09-28', type: 'queens', difficulty: null },
    ])
  })

  it('returns nothing when no day has a puzzle', async () => {
    expect(await listPublishedPuzzles('2026-10-03', fetcherFor([]))).toEqual([])
  })
})

describe('probePuzzles', () => {
  it('returns the puzzle behind each id it can reach', async () => {
    const probes = await probePuzzles(['2026-10-01', '2026-10-01-star'], fetcherFor(['2026-10-01', '2026-10-01-star']))
    expect(probes.map((probe) => probe.puzzle?.puzzleType)).toEqual(['queens', 'star-battle'])
  })

  it('reports an absent id as null instead of rejecting', async () => {
    // A day mid-publish has its Queens board out and no companion yet.
    const probes = await probePuzzles(['2026-10-01', '2026-10-01-star'], fetcherFor(['2026-10-01']))
    expect(probes).toHaveLength(2)
    expect(probes[0]?.puzzle?.puzzleType).toBe('queens')
    expect(probes[1]).toEqual({ id: '2026-10-01-star', puzzle: null })
  })

  it('keeps every id in the order asked, so the chooser shows both families', async () => {
    const probes = await probePuzzles(['2026-10-01-star', '2026-10-01'], fetcherFor([]))
    expect(probes.map((probe) => probe.id)).toEqual(['2026-10-01-star', '2026-10-01'])
    expect(probes.every((probe) => probe.puzzle === null)).toBe(true)
  })

  it('keeps the other probe when one request fails at the network layer', async () => {
    // `Promise.all` would reject here and throw away the board that had already
    // loaded, reporting both cards as unpublished over one unreachable file.
    const flaky = async (url: string) => {
      if (url.includes('-star.json')) throw new TypeError('Failed to fetch')
      return fetcherFor(['2026-10-01'])(url)
    }
    const probes = await probePuzzles(['2026-10-01', '2026-10-01-star'], flaky)
    expect(probes[0]?.puzzle?.puzzleType).toBe('queens')
    expect(probes[1]).toEqual({ id: '2026-10-01-star', puzzle: null })
  })

  it('does not reject when every request fails', async () => {
    const allDown = async () => {
      throw new TypeError('Failed to fetch')
    }
    const probes = await probePuzzles(['2026-10-01', '2026-10-01-star'], allDown)
    expect(probes.every((probe) => probe.puzzle === null)).toBe(true)
  })

  it('treats a puzzle file that no longer validates as absent', async () => {
    const broken = async (url: string) =>
      url.includes('2026-10-01.json') ? jsonResponse({ id: '2026-10-01', type: 'nope' }) : spaShellResponse()
    const probes = await probePuzzles(['2026-10-01', '2026-10-01-star'], broken)
    expect(probes.map((probe) => probe.puzzle)).toEqual([null, null])
  })
})
