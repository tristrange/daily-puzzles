// @vitest-environment jsdom
import { act, createElement, useLayoutEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { historyCommand, useMoveHistory } from './useMoveHistory'

it('can redo undo of restored progress and keeps its 100-move bound', () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const root = createRoot(document.createElement('div'))
  let rendered: ReturnType<typeof useMoveHistory<number>> | undefined
  function HistoryHarness() {
    const history = useMoveHistory<number>()
    useLayoutEffect(() => { rendered = history })
    return null
  }
  const history = () => {
    if (!rendered) throw Error('History is not mounted')
    return rendered
  }
  try {
    act(() => root.render(createElement(HistoryHarness)))
    let current = 5
    const undo = (fallback?: number) => act(() => { current = history().undo(current, fallback) ?? current })
    const redo = () => act(() => { current = history().redo(current) ?? current })
    undo(4)
    expect(current).toBe(4)
    redo()
    expect(current).toBe(5)
    for (let before = 5; before < 106; before++) act(() => { history().remember(before) })
    current = 106
    for (let n = 0; n < 100; n++) undo()
    expect(current).toBe(6)
    expect(history().canUndo).toBe(false)
    for (let n = 0; n < 100; n++) redo()
    expect(current).toBe(106)
    expect(history().canRedo).toBe(false)
  } finally {
    act(() => root.unmount())
    vi.unstubAllGlobals()
  }
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
