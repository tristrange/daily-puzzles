import type { ComponentProps, ReactElement } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { ResetButton } from './ResetButton'

afterEach(() => vi.unstubAllGlobals())

it('leaves the attempt alone on Cancel and resets only after confirmation', () => {
  const confirm = vi.fn(() => false)
  vi.stubGlobal('window', { confirm })
  const reset = vi.fn()
  const button = ResetButton({ disabled: false, onReset: reset }) as ReactElement<ComponentProps<'button'>>
  const click = () => button.props.onClick!({} as Parameters<NonNullable<typeof button.props.onClick>>[0])
  click()
  expect(confirm).toHaveBeenCalledOnce()
  expect(reset).not.toHaveBeenCalled()
  confirm.mockReturnValue(true)
  click()
  expect(reset).toHaveBeenCalledOnce()
})
