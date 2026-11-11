import { useEffect, useId, useRef, useState } from 'react'
import { evaluate, type EnclosureGrid } from '../domain/enclosure'
import { ENCLOSURE_SOLUTION_CACHE_CHANGED, loadEnclosureSolution, parseEnclosureSolution, readCachedEnclosureSolution, type EnclosureSolution } from '../lib/enclosureSolution'
import { EnclosureBoard } from './EnclosureBoard'

type View = { status: 'closed'; solution: EnclosureSolution | null }
  | { status: 'loading' } | { status: 'error' }
  | { status: 'open'; solution: EnclosureSolution }

export function EnclosureSolutionPanel({ id, grid, canReveal, provided }: { id: string; grid: EnclosureGrid; canReveal: boolean; provided?: EnclosureSolution }) {
  const [view, setView] = useState<View>({ status: 'closed', solution: null })
  const [saved, setSaved] = useState(() => parseEnclosureSolution(provided, id, grid) !== null)
  const request = useRef(0)
  const heading = useRef<HTMLHeadingElement>(null)
  const headingId = useId(), instructionsId = useId()
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
  useEffect(() => { if (canReveal && view.status === 'open') heading.current?.focus() }, [view, canReveal])
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
  const result = view.status === 'open' ? evaluate(grid, view.solution.walls) : null
  return <div className="enclosure-solution">
    {canReveal && <button type="button" className="tool-button" disabled={view.status === 'loading'} aria-expanded={view.status === 'open'}
      onClick={() => { if (view.status === 'open') setView({ status: 'closed', solution: view.solution }); else void show() }}>
      {view.status === 'loading' ? 'Loading optimal solution…' : view.status === 'open' ? 'Hide optimal solution' : view.status === 'error' ? 'Retry optimal solution' : 'Show optimal solution'}
    </button>}
    <p className="enclosure-status" role="status">{saved ? canReveal ? 'Optimal solution available offline.' : 'Optimal solution available offline after submitting.' : view.status === 'open'
      ? 'This solution is available for this visit, but could not be saved for offline viewing.'
      : 'Optimal solution not saved for offline viewing yet.'}</p>
    {view.status === 'error' && <p className="enclosure-status" role="alert">Could not load a verified optimal solution. Connect to the internet and try again.</p>}
    {canReveal && view.status === 'open' && result && <section className="enclosure-solution-board" aria-labelledby={headingId}>
      <h2 id={headingId} ref={heading} tabIndex={-1}>One optimal solution</h2>
      <p id={instructionsId} className="enclosure-status">Area: {result.score} · Walls: {view.solution.walls.length} / {grid.wallBudget}. Read-only; arrow keys explore the cells.</p>
      <EnclosureBoard grid={grid} walls={view.solution.walls} reachable={result.reachable} enclosed instructionsId={instructionsId} readOnly label="Optimal enclosure solution" />
    </section>}
  </div>
}
