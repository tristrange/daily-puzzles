import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import certificates from '../../../docs/measurements/star-battle-chains.json'
import { STAR_BATTLE_CHAINS } from './starBattleChains'

it('uses the certified published boards and accepts every forced star in each chain', () => {
  expect(STAR_BATTLE_CHAINS).toHaveLength(3)
  for (const [index, lesson] of STAR_BATTLE_CHAINS.entries()) {
    const proof = certificates.lessons[index]!
    const source = readFileSync(new URL(`../../public/puzzles/${lesson.source}.json`, import.meta.url))
    expect(createHash('sha256').update(source).digest('hex')).toBe(proof.source_sha256)
    expect(lesson.answers).toEqual(proof.answers)
    expect(lesson.answers.every(cell => proof.unique_solution.includes(cell))).toBe(true)
    expect(proof.unique_solution).not.toContain(lesson.first.cell)
    expect(lesson.reasons).toHaveLength(2)
  }
})
