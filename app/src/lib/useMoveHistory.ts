import { useState } from 'react'

const LIMIT = 100

/** Session-only history; gestures and reset each record one complete state. */
export function useMoveHistory<T>() {
  const [past, setPast] = useState<T[]>([])
  const [future, setFuture] = useState<T[]>([])
  return {
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    clear() { setPast([]); setFuture([]) },
    remember(before: T) {
      setPast((states) => [...states.slice(1 - LIMIT), before])
      setFuture([])
    },
    undo(current: T, fallback?: T): T | undefined {
      const previous = past.at(-1) ?? fallback
      if (previous === undefined || previous === current) return undefined
      setPast(past.slice(0, -1))
      setFuture((states) => [...states.slice(1 - LIMIT), current])
      return previous
    },
    redo(current: T): T | undefined {
      const next = future.at(-1)
      if (next === undefined) return undefined
      setFuture(future.slice(0, -1))
      setPast((states) => [...states.slice(1 - LIMIT), current])
      return next
    },
  }
}

export function historyCommand(event: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>): 'undo' | 'redo' | null {
  if ((!event.ctrlKey && !event.metaKey) || event.altKey) return null
  const key = event.key.toLowerCase()
  return key === 'z' ? (event.shiftKey ? 'redo' : 'undo') : key === 'y' ? 'redo' : null
}
