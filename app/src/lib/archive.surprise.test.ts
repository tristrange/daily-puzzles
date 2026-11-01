import { expect, it } from 'vitest'
import sudokuEasy from '../../public/puzzles/2026-10-21-sudoku-easy.json'
import sudokuMedium from '../../public/puzzles/2026-10-21-sudoku-medium.json'
import sudokuHard from '../../public/puzzles/2026-10-21-sudoku-hard.json'
import futureSudoku from '../../public/puzzles/2026-10-22-sudoku-easy.json'
import { findSurprisePuzzle, type SurpriseOutcome } from './archive'

const today = '2026-10-21'
const sudoku = [sudokuEasy, sudokuMedium, sudokuHard]

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
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
