import type { TrioSymbol as SymbolValue } from '../domain/trio'

/** Original silhouettes stay consistent across emoji fonts, themes and devices. */
export function TrioSymbol({ value }: { value: SymbolValue }) {
  return <svg className={`trio-symbol trio-symbol-${value}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    {value === 1 ? <>
      <circle cx="12" cy="12" r="5" fill="currentColor" />
      <path d="M12 1v3m0 16v3M1 12h3m16 0h3M4.2 4.2l2.1 2.1m11.4 11.4 2.1 2.1M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </> : value === 2 ? <path d="M19.5 16.5A9.5 9.5 0 0 1 8 3a9.5 9.5 0 1 0 11.5 13.5Z" fill="currentColor" />
      : <path d="m12 1.5 3.1 6.8 7.4.9-5.5 5.1 1.5 7.3-6.5-3.7-6.5 3.7 1.5-7.3L1.5 9.2l7.4-.9Z" fill="currentColor" />}
  </svg>
}
