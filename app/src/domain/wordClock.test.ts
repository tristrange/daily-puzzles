import { expect, it } from 'vitest'
import { advanceWordClock } from './wordClock'
it('counts visible time and excludes hidden time and clock rollback', () => {
  let clock = { elapsedMs: 4000, lastAt: 1000, visible: true }
  clock = advanceWordClock(clock, 2000, false)
  expect(clock.elapsedMs).toBe(5000)
  clock = advanceWordClock(clock, 10000, false)
  clock = advanceWordClock(clock, 20000, true)
  expect(clock.elapsedMs).toBe(5000)
  clock = advanceWordClock(clock, 21000, true)
  expect(clock.elapsedMs).toBe(6000)
  expect(advanceWordClock(clock, 20500, true).elapsedMs).toBe(6000)
})

it('keeps fractional monotonic intervals until persistence rounds them', () => {
  const first = advanceWordClock({ elapsedMs: 0, lastAt: 1000.5, visible: true }, 1500.25, true)
  expect(first.elapsedMs).toBe(499.75)
  expect(advanceWordClock(first, 2000.25, true).elapsedMs).toBe(999.75)
})
