import { useEffect, useState } from 'react'

export type HintReturn = { readonly id: string; readonly state: string; readonly signature: string }
const PREFIX = 'daily-puzzles:hint-return:'
let pending: HintReturn | null = null

/** A hint's source is a live game object; the remaining evidence is stable. */
export function hintSignature(hint: { readonly cell: number }): string {
  return JSON.stringify(hint, (key, value: unknown) => key === 'source' ? undefined : value)
}

export function rememberHint(hint: HintReturn): void {
  pending = hint
  try { sessionStorage.setItem(PREFIX + hint.id, JSON.stringify(hint)) } catch { /* In-memory return still works. */ }
}

function readHint(id: string): HintReturn | null {
  if (pending?.id === id) return pending
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(PREFIX + id) ?? 'null')
    if (typeof value === 'object' && value !== null && 'id' in value && value.id === id
      && 'state' in value && typeof value.state === 'string'
      && 'signature' in value && typeof value.signature === 'string') {
      return { id, state: value.state, signature: value.signature }
    }
  } catch { /* Storage may be unavailable or contain malformed data. */ }
  return null
}

/** Restore a paid hint only if the board and the freshly calculated hint still match. */
export function useReturnedHint<T extends { readonly cell: number }>(id: string, state: string, find: () => T | null): T | null {
  const [hint] = useState(() => {
    const saved = readHint(id)
    if (!saved || saved.state !== state) return null
    const current = find()
    return current && hintSignature(current) === saved.signature ? current : null
  })
  useEffect(() => {
    if (pending?.id === id) pending = null
    try { sessionStorage.removeItem(PREFIX + id) } catch { /* The hint still works for this visit. */ }
  }, [id])
  return hint
}
