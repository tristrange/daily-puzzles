export function TentsSymbol({ kind }: { kind: 'tree' | 'tent' | 'grass' | 'erase' }) {
  return <svg className={`tents-symbol tents-${kind}`} viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {kind === 'tree' ? <><path d="M16 3 5 18h6l-5 7h20l-5-7h6L16 3Z" fill="currentColor" fillOpacity="0.2" /><path d="M16 25v5" /></>
      : kind === 'tent' ? <><path d="m16 5 13 23H3L16 5Z" fill="currentColor" fillOpacity="0.18" /><path d="m16 5-5 23m5-23 5 23M11 28l5-7 5 7" /></>
        : kind === 'grass' ? <path d="m8 23 4 4m12-4-4 4m-4-9v9M6 29h20" />
          : <><path d="m12 8-9 9 8 8h16V8H12Z" /><path d="m15 13 8 8m0-8-8 8" /></>}
  </svg>
}
