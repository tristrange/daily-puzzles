import { describe, expect, it } from 'vitest'
import { parseArchivePage } from './archive'

describe('parseArchivePage', () => {
  it('falls back to the newest window for anything but a bounded page number', () => {
    expect(parseArchivePage(null)).toBe(0)
    expect(parseArchivePage('2')).toBe(2)
    expect(parseArchivePage('0')).toBe(0)
    expect(parseArchivePage('-1')).toBe(0)
    expect(parseArchivePage('1.5')).toBe(0)
    expect(parseArchivePage('1001')).toBe(0)
  })
})
