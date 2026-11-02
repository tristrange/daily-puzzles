import { afterEach, expect, it, vi } from 'vitest'
import sudokuEasy from '../../public/puzzles/2026-10-21-sudoku-easy.json'
import sudokuMedium from '../../public/puzzles/2026-10-21-sudoku-medium.json'
import sudokuHard from '../../public/puzzles/2026-10-21-sudoku-hard.json'
import futureSudoku from '../../public/puzzles/2026-10-22-sudoku-easy.json'
import cachedQueens from '../../public/puzzles/2026-10-19.json'
import tracksSmall from '../../public/puzzles/2026-10-23-tracks-small.json'
import legacyTracks from '../../public/puzzles/2026-10-16-tracks.json'
import { findSurprisePuzzle, type SurpriseOutcome } from './archive'

const today = '2026-10-21'
const sudoku = [sudokuEasy, sudokuMedium, sudokuHard]
afterEach(() => vi.unstubAllGlobals())

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
}

function savedUrl(id: string): string {
  return `https://example.test${import.meta.env.BASE_URL}puzzles/${id}.json`
}

function spaShellResponse(): Response {
  return new Response('<!doctype html><html></html>', { headers: { 'content-type': 'text/html' } })
}

function fetcherFor(files: readonly { id: string }[]) {
  const requested: string[] = []
  const fetcher = async (url: string) => {
    const id = url.split('/').at(-1)?.replace('.json', '') ?? ''
    requested.push(id)
    const file = files.find((candidate) => candidate.id === id)
    return file === undefined ? spaShellResponse() : jsonResponse(file)
  }
  return { fetcher, requested }
}

function foundId(outcome: SurpriseOutcome): string {
  if (outcome.status !== 'found') throw Error('expected a puzzle')
  return outcome.puzzle.id
}

it('selects an unsolved variant without fetching a completed one', async () => {
  const { fetcher, requested } = fetcherFor(sudoku)

  const outcome = await findSurprisePuzzle({
    todayId: today,
    type: 'sudoku',
    solved: new Set(['2026-10-21-sudoku-easy']),
    fetcher,
    random: () => 0,
    maxDays: 1,
  })

  expect(outcome).toEqual({
    status: 'found',
    puzzle: { id: '2026-10-21-sudoku-medium', type: 'sudoku', difficulty: null, width: 9, height: 9 },
  })
  expect(requested).toEqual(['2026-10-21-sudoku-medium', '2026-10-21-sudoku-hard'])
})

it('never probes a date after today', async () => {
  const { fetcher, requested } = fetcherFor([...sudoku, futureSudoku])

  const outcome = await findSurprisePuzzle({
    todayId: today,
    type: 'sudoku',
    solved: new Set(),
    fetcher,
    random: () => 0,
    maxDays: 1,
  })

  expect(foundId(outcome)).toBe('2026-10-21-sudoku-easy')
  expect(requested).not.toContain(futureSudoku.id)
})

it('skips a missing day and keeps looking', async () => {
  const fetcher = async (url: string) => {
    const id = url.split('/').at(-1)?.replace('.json', '') ?? ''
    if (id === '2026-10-20-sudoku-hard') return jsonResponse({ ...sudokuHard, id })
    return spaShellResponse()
  }

  const outcome = await findSurprisePuzzle({
    todayId: today,
    type: 'sudoku',
    solved: new Set(),
    fetcher,
    random: () => 0,
    maxDays: 2,
  })

  expect(foundId(outcome)).toBe('2026-10-20-sudoku-hard')
})

it('reports completed variants without requesting them', async () => {
  const { fetcher, requested } = fetcherFor(sudoku)

  const outcome = await findSurprisePuzzle({
    todayId: today,
    type: 'sudoku',
    solved: new Set(sudoku.map((file) => file.id)),
    fetcher,
    random: () => 0,
    maxDays: 1,
  })

  expect(outcome).toEqual({ status: 'none', checked: 1, completed: 3, unavailable: false })
  expect(requested.some((id) => id.startsWith('2026-10-21-sudoku-'))).toBe(false)
})

it('reports unavailable when candidates cannot be reached', async () => {
  const offline = async () => {
    throw new TypeError('Failed to fetch')
  }

  const outcome = await findSurprisePuzzle({
    todayId: today,
    type: 'sudoku',
    solved: new Set(),
    fetcher: offline,
    random: () => 0,
    maxDays: 2,
  })

  expect(outcome).toEqual({ status: 'none', checked: 2, completed: 0, unavailable: true })
})

it('finds an older unsolved Train Tracks board after recent sizes are completed', async () => {
  const solved = new Set(Array.from({ length: 8 }, (_, index) =>
    ['small', 'medium', 'large'].map(size => `2026-10-${31 - index}-tracks-${size}`)).flat())
  const { fetcher } = fetcherFor([tracksSmall])
  const outcome = await findSurprisePuzzle({ todayId: '2026-10-31', type: 'train-tracks', solved, fetcher, random: () => 0 })
  expect(foundId(outcome)).toBe(tracksSmall.id)
})

it('keeps a queued original Train Tracks board available alongside the sizes', async () => {
  const { fetcher } = fetcherFor([legacyTracks])
  const solved = new Set(['small', 'medium', 'large'].map(size => `2026-10-16-tracks-${size}`))
  const outcome = await findSurprisePuzzle({ todayId: '2026-10-16', type: 'train-tracks', solved, fetcher, random: () => 0, maxDays: 1 })
  expect(foundId(outcome)).toBe(legacyTracks.id)
})

it('finds an unsolved downloaded puzzle outside the random sample while offline', async () => {
  vi.stubGlobal('caches', { open: async () => ({
    keys: async () => [new Request(savedUrl(cachedQueens.id))],
    match: async (url: string) => url.endsWith(`/${cachedQueens.id}.json`) ? jsonResponse(cachedQueens) : undefined,
    put: async () => {},
  }) })
  const outcome = await findSurprisePuzzle({
    todayId: '2026-10-31', type: 'queens', solved: new Set(), random: () => 0,
    fetcher: async () => { throw new TypeError('offline') },
  })
  expect(foundId(outcome)).toBe(cachedQueens.id)
})

it('only offers a valid, unsolved downloaded puzzle of the selected game and date', async () => {
  const saved = [futureSudoku, sudokuEasy, cachedQueens, sudokuMedium, sudokuHard]
  vi.stubGlobal('caches', { open: async () => ({
    keys: async () => saved.map(file => new Request(savedUrl(file.id))),
    match: async (url: string) => {
      const file = saved.find(candidate => url.endsWith(`/${candidate.id}.json`))
      return file && jsonResponse(file.id === sudokuMedium.id ? {} : file)
    },
  }) })
  const outcome = await findSurprisePuzzle({
    todayId: today, type: 'sudoku', solved: new Set([sudokuEasy.id]), random: () => 0, maxDays: 0,
    fetcher: async () => { throw new TypeError('offline') },
  })
  expect(foundId(outcome)).toBe(sudokuHard.id)
})
