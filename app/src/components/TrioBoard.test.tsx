import type { ComponentProps, ReactElement, RefObject } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { createTrioGame, type TrioBoard as Board } from '../domain/trio'
import { TrioBoard } from './TrioBoard'

// Exercise the real event handlers without adding a browser test dependency.
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useRef: (current: unknown) => ({ current }),
  useState: (initial: () => unknown) => [initial(), vi.fn()],
  useEffect: () => {},
}))

afterEach(() => vi.unstubAllGlobals())

it('keeps a held stroke isolated from keyboard edits and cancels it before Undo', () => {
  const board: Board = { id: 'trio-preview-1', givens: Array.from({ length: 81 }, () => 0), relations: [] }
  const events: string[] = []
  const element = TrioBoard({ board, game: createTrioGame(board), brush: 1, pencil: false, locked: false,
    conflicts: new Set(), instructionsId: 'rules', onBegin: () => events.push('begin'),
    onApply: () => events.push('apply'), onEnd: (cancel) => events.push(cancel ? 'cancel' : 'commit'),
    onUndo: () => events.push('undo'), onPencil: vi.fn(),
  }) as ReactElement<ComponentProps<'div'>>
  const props = element.props
  const grid = { contains: () => true, querySelector: () => ({ focus: vi.fn() }),
    setPointerCapture: vi.fn(), hasPointerCapture: () => true, releasePointerCapture: vi.fn() }
  ;(props.ref as RefObject<unknown>).current = grid
  vi.stubGlobal('document', { elementFromPoint: () => ({ closest: () => ({ dataset: { cell: '0' } }) }) })
  const down = { pointerId: 1, button: 0, clientX: 0, clientY: 0 }
  const key = (value: string, ctrlKey = false) => props.onKeyDown!({ key: value, ctrlKey, preventDefault: vi.fn() } as unknown as Parameters<NonNullable<typeof props.onKeyDown>>[0])
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
})
