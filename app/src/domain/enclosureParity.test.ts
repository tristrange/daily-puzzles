import { expect, it } from 'vitest'
import cases from '../../../conformance/enclosure-cases/generated.json'
import { EnclosureGrid, evaluate } from './enclosure'

it.each(cases)('matches Python evaluation for $name', ({ size, water, horse, wallBudget, walls, escaped, reachable, score }) => {
  expect(evaluate(new EnclosureGrid(size, water, horse, wallBudget), walls)).toEqual({ escaped, reachable, score })
})
