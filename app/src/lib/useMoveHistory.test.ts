import { afterEach, expect, it, vi } from 'vitest'
import { historyCommand, useMoveHistory } from './useMoveHistory'

const hooks = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0 }))
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => {
    const index = hooks.cursor++
    if (!(index in hooks.values)) hooks.values[index] = initial
    return [hooks.values[index], (value: unknown) => {
      hooks.values[index] = typeof value === 'function' ? value(hooks.values[index]) : value
    }]
  },
}))
afterEach(() => { hooks.values = []; hooks.cursor = 0 })

it('can redo undo of restored progress and keeps its 100-move bound', () => {
  const HistoryHarness = () => useMoveHistory<number>()
  const render = () => { hooks.cursor = 0; return HistoryHarness() }
  expect(render().undo(5, 4)).toBe(4)
  expect(render().redo(4)).toBe(5)
  for (let before = 5; before < 106; before++) render().remember(before)
  let current = 106
  for (let n = 0; n < 100; n++) current = render().undo(current)!
  expect(current).toBe(6)
  expect(render().canUndo).toBe(false)
  for (let n = 0; n < 100; n++) current = render().redo(current)!
  expect(current).toBe(106)
  expect(render().canRedo).toBe(false)
})

it('recognises Undo and Redo shortcuts without stealing ordinary keys or Alt combinations', () => {
  const base = { key: 'z', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false }
  expect(historyCommand(base)).toBe('undo')
  expect(historyCommand({ ...base, key: 'Z', shiftKey: true })).toBe('redo')
  expect(historyCommand({ ...base, ctrlKey: false, metaKey: true, key: 'Z', shiftKey: true })).toBe('redo')
  expect(historyCommand({ ...base, key: 'y' })).toBe('redo')
  expect(historyCommand({ ...base, altKey: true })).toBeNull()
  expect(historyCommand({ ...base, ctrlKey: false })).toBeNull()
  expect(historyCommand({ ...base, key: 'c' })).toBeNull()
})
