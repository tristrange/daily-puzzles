import { useEffect, useRef, useState } from 'react'
import type { EnclosureGrid } from '../domain/enclosure'
import { ENCLOSURE_SOLUTION_CACHE_CHANGED, loadEnclosureSolution, parseEnclosureSolution, readCachedEnclosureSolution, type EnclosureSolution } from './enclosureSolution'

type View = { status: 'closed'; solution: EnclosureSolution | null }
  | { status: 'loading' } | { status: 'error' }
  | { status: 'open'; solution: EnclosureSolution }

export function useEnclosureSolution({ id, grid, canReveal, provided }: { id: string; grid: EnclosureGrid; canReveal: boolean; provided?: EnclosureSolution }) {
  const [view, setView] = useState<View>({ status: 'closed', solution: null })
  const [saved, setSaved] = useState(() => parseEnclosureSolution(provided, id, grid) !== null)
  const request = useRef(0)
  useEffect(() => () => { request.current++ }, [])
  useEffect(() => {
    let active = true
    const refresh = () => {
      if (parseEnclosureSolution(provided, id, grid)) { setSaved(true); return }
      void readCachedEnclosureSolution(id, grid).then(solution => { if (active) setSaved(solution !== null) })
    }
    const changed = (event: Event) => {
      if (!(event instanceof CustomEvent)) return
      const detail: unknown = event.detail
      if (typeof detail === 'object' && detail !== null && 'id' in detail && detail.id === id) refresh()
    }
    refresh()
    window.addEventListener(ENCLOSURE_SOLUTION_CACHE_CHANGED, changed)
    return () => { active = false; window.removeEventListener(ENCLOSURE_SOLUTION_CACHE_CHANGED, changed) }
  }, [id, grid, provided])
  const show = async () => {
    if (view.status === 'closed' && view.solution) {
      setView({ status: 'open', solution: view.solution })
      if (!saved) void loadEnclosureSolution(id, grid).catch(() => {})
      return
    }
    const current = ++request.current
    setView({ status: 'loading' })
    try {
      const solution = parseEnclosureSolution(provided, id, grid) ?? await loadEnclosureSolution(id, grid)
      if (current === request.current) setView({ status: 'open', solution })
    } catch { if (current === request.current) setView({ status: 'error' }) }
  }
  const toggle = () => {
    if (!canReveal || view.status === 'loading') return
    if (view.status === 'open') setView({ status: 'closed', solution: view.solution })
    else void show()
  }
  return { view, saved, toggle }
}
