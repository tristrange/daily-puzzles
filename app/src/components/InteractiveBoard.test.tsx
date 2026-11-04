// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { STAR_BATTLE_LESSONS } from '../domain/starBattleLessons'
import { InteractiveBoard } from './InteractiveBoard'

it('lets a locked board inspect cells while refusing keyboard, pointer, history and hint actions', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const lesson = STAR_BATTLE_LESSONS[0]
  if (!lesson) throw Error('Missing lesson')
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const edit = vi.fn()
  try {
    await act(async () => root.render(<InteractiveBoard board={lesson.board} game={lesson.game} locked
      hint={lesson.hint} conflictCells={new Set()} onToggleQueen={edit} onToggleMark={edit} onClear={edit}
      onUndo={edit} onRedo={edit} onRequestHint={edit} onGestureStart={edit} onPaintCell={edit} onGestureEnd={edit} />))
    const first = container.querySelector<HTMLElement>('[data-cell="0"]')
    if (!first) throw Error('Missing first cell')
    first.focus()
    const key = async (name: string, extra = {}) => act(async () => {
      document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, ...extra }))
    })
    await key('ArrowRight')
    expect(document.activeElement?.getAttribute('data-cell')).toBe('1')
    await key('ArrowDown')
    expect(document.activeElement?.getAttribute('data-cell')).toBe(String(lesson.board.size + 1))
    await key('End')
    expect(document.activeElement?.getAttribute('data-cell')).toBe(String(lesson.board.size * 2 - 1))
    await key('Home')
    expect(document.activeElement?.getAttribute('data-cell')).toBe(String(lesson.board.size))
    await key('ArrowUp'); await key('ArrowLeft')
    expect(document.activeElement?.getAttribute('data-cell')).toBe('0')
    for (const name of ['Enter', ' ', 'x', 'X', 'Delete', 'Backspace', 'h', 'H']) await key(name)
    await key('z', { ctrlKey: true }); await key('z', { metaKey: true }); await key('Z', { ctrlKey: true, shiftKey: true })
    await act(async () => {
      first.dispatchEvent(new MouseEvent('pointerdown', { button: 0, bubbles: true }))
      first.dispatchEvent(new MouseEvent('pointermove', { bubbles: true }))
      first.dispatchEvent(new MouseEvent('contextmenu', { button: 2, bubbles: true }))
      window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }))
    })
    expect(edit).not.toHaveBeenCalled()
    expect(container.querySelectorAll('[tabindex="0"]')).toHaveLength(1)
  } finally {
    await act(async () => root.unmount())
    container.remove(); vi.unstubAllGlobals()
  }
})

it('numbers each row so the finished board can sweep down it', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const lesson = STAR_BATTLE_LESSONS[0]
  if (!lesson) throw Error('Missing lesson')
  const container = document.createElement('div')
  const root = createRoot(container)
  const noop = () => {}
  try {
    await act(async () => root.render(<InteractiveBoard board={lesson.board} game={lesson.game} hint={null}
      conflictCells={new Set()} onToggleQueen={noop} onToggleMark={noop} onClear={noop} onUndo={noop}
      onRedo={noop} onRequestHint={noop} onGestureStart={noop} onPaintCell={noop} onGestureEnd={noop} />))
    const rows = [...container.querySelectorAll<HTMLElement>('[role="row"]')]
    expect(rows).toHaveLength(lesson.board.size)
    // The completion wave delays each row by this, so a missing number turns it
    // from a sweep into one flat flash.
    expect(rows.map(row => row.style.getPropertyValue('--row')))
      .toEqual(rows.map((_, row) => String(row)))
  } finally {
    await act(async () => root.unmount())
    container.remove(); vi.unstubAllGlobals()
  }
})
