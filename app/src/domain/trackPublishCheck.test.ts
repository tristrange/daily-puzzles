import { spawnSync } from 'node:child_process'
import { expect, it } from 'vitest'
import small from '../../public/puzzles/2026-11-05-tracks-small.json'

it('runs the published hint checker and distinguishes a stall from an error', () => {
  const run = (input: string) => spawnSync(process.execPath, ['scripts/verify-track-hints.mjs'], {
    input, encoding: 'utf8', timeout: 30_000,
  })
  expect(run(JSON.stringify(small)).status).toBe(0)
  const ambiguous = { board: {
    width: 4, height: 4, rowClues: [4, 4, 4, 2], colClues: [3, 3, 4, 4],
    givens: [3, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  } }
  expect(run(JSON.stringify(ambiguous)).status).toBe(1)
  expect(run('{ invalid').status).toBe(2)
})
