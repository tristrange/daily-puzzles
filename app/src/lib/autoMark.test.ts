/**
 * The auto-mark preference: what survives a reload, and what a hostile or stale
 * stored value can do.
 *
 * The property that matters is that *off* stays the answer for anything the
 * module does not recognise. Auto-mark draws conclusions on the player's board,
 * so a value that cannot be understood must not be read as consent to use it.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { AUTO_MARK_STORAGE_KEY, parseAutoMark, readStoredAutoMark, storeAutoMark } from './autoMark'

/** A `localStorage` stand-in; a Map is enough for the interface used here. */
function stubStorage(initial: Record<string, string> = {}): Map<string, string> {
  const map = new Map(Object.entries(initial))
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  })
  return map
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the auto-mark preference', () => {
  it('keys storage under a namespaced name', () => {
    expect(AUTO_MARK_STORAGE_KEY).toBe('daily-puzzles:auto-mark')
  })

  it('round-trips each choice', () => {
    stubStorage()
    storeAutoMark(true)
    expect(readStoredAutoMark()).toBe(true)
    storeAutoMark(false)
    expect(readStoredAutoMark()).toBe(false)
  })

  it('reads off when nothing has been stored', () => {
    stubStorage()
    expect(readStoredAutoMark()).toBe(false)
  })

  it('treats anything unrecognised as off, not as on', () => {
    // A future version writing `1`, or a hand-edited value, must not silently
    // start drawing conclusions the player did not ask for.
    for (const value of [null, undefined, '', '1', 'yes', 'TRUE', 'true ', 'on', '{}']) {
      expect(parseAutoMark(value)).toBe(false)
    }
    expect(parseAutoMark('true')).toBe(true)
  })

  it('survives storage that throws on access, as private browsing does', () => {
    // Reading throws, not just writing, and this has to be worth having.
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
    })
    expect(readStoredAutoMark()).toBe(false)
    expect(() => storeAutoMark(true)).not.toThrow()
  })
})
