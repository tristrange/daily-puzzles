import type { ComponentProps, ReactElement, RefObject } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { createTrioGame, type TrioBoard as Board } from '../domain/trio'
import { TrioBoard } from './TrioBoard'

// Exercise the real event handlers without adding a browser test dependency.
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useRef: (current: unknown) => ({ current }),
  useState: (initial: () => unknown) => [initial(), vi.fn()],
  useEffectEvent: (callback: unknown) => callback,
  useEffect: () => {},
}))

afterEach(() => vi.unstubAllGlobals())

it('keeps a held stroke isolated from keyboard edits and cancels it before Undo', () => {
  const board: Board = { id: 'trio-preview-1', givens: Array.from({ length: 81 }, () => 0), relations: [] }
  const events: string[] = []
  const element = TrioBoard({ board, game: createTrioGame(board), brush: 1, pencil: false, locked: false,
    conflicts: new Set(), instructionsId: 'rules', onBegin: () => { events.push('begin') },
    onApply: () => events.push('apply'), onEnd: (cancel) => { events.push(cancel ? 'cancel' : 'commit') },
    onUndo: () => events.push('undo'), onRedo: () => events.push('redo'), onPencil: vi.fn(),
  }) as ReactElement<ComponentProps<'div'>>
  const props = element.props
  const grid = { contains: () => true, querySelector: () => ({ focus: vi.fn() }),
    setPointerCapture: vi.fn(), hasPointerCapture: () => true, releasePointerCapture: vi.fn() }
  ;(props.ref as RefObject<unknown>).current = grid
  vi.stubGlobal('document', { elementFromPoint: () => ({ closest: () => ({ dataset: { cell: '0' } }) }) })
  const down = { pointerId: 1, button: 0, clientX: 0, clientY: 0 }
  const key = (value: string, ctrlKey = false, shiftKey = false) => props.onKeyDown!({ key: value, ctrlKey, shiftKey, preventDefault: vi.fn() } as unknown as Parameters<NonNullable<typeof props.onKeyDown>>[0])
  const pointerDown = () => props.onPointerDown!(down as unknown as Parameters<NonNullable<typeof props.onPointerDown>>[0])
  const pointerUp = () => props.onPointerUp!(down as unknown as Parameters<NonNullable<typeof props.onPointerUp>>[0])

  pointerDown()
  key('2')
  expect(events).toEqual(['begin', 'apply'])
  pointerUp()
  expect(events).toEqual(['begin', 'apply', 'commit'])

  events.length = 0
  pointerDown()
  key('z', true)
  pointerUp()
  expect(events).toEqual(['begin', 'apply', 'cancel', 'undo'])

  events.length = 0
  pointerDown()
  key('Z', true, true)
  pointerUp()
  expect(events).toEqual(['begin', 'apply', 'cancel', 'redo'])
})

it('preserves the daily solved lock when the lesson inspection prop is absent', () => {
  const board: Board = { id: 'trio-preview-1', givens: Array.from({ length: 81 }, () => 0), relations: [] }
  const edit = vi.fn()
  const element = TrioBoard({ board, game: createTrioGame(board), brush: 1, pencil: false, locked: true,
    conflicts: new Set(), instructionsId: 'rules', onBegin: edit, onApply: edit, onEnd: edit,
    onUndo: edit, onRedo: edit, onPencil: edit,
  }) as ReactElement<ComponentProps<'div'>>
  const props = element.props
  props.onPointerDown!({ pointerId: 1, button: 0, clientX: 0, clientY: 0 } as unknown as Parameters<NonNullable<typeof props.onPointerDown>>[0])
  for (const key of ['1', '2', '3', 'n', 'Delete', 'Backspace', 'Enter', ' ', 'z']) {
    props.onKeyDown!({ key, ctrlKey: key === 'z', preventDefault: vi.fn() } as unknown as Parameters<NonNullable<typeof props.onKeyDown>>[0])
  }
  expect(edit).not.toHaveBeenCalled()
})
