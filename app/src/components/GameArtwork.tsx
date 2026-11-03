import type { PuzzleType } from '../domain/board'

/** Decorative symbols share the same silhouettes as the games they represent. */
export function GameIcon({ type }: { readonly type: PuzzleType }) {
  return <svg viewBox="0 0 40 40" fill="none" aria-hidden="true" focusable="false">
    {type === 'queens' && <><path d="M7 29 5 12l9 7 6-11 6 11 9-7-2 17H7Z" fill="currentColor" /><path d="M9 32h22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></>}
    {type === 'star-battle' && <path d="m20 3 5.2 10.7 11.8 1.7-8.5 8.3 2 11.7L20 29.9 9.5 35.4l2-11.7L3 15.4l11.8-1.7L20 3Z" fill="currentColor" />}
    {type === 'train-tracks' && <path d="M8 8v24M32 8v24M8 12h24M8 20h24M8 28h24" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />}
    {type === 'word-paths' && <><path d="m9 29 6-18 10 15 6-17" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /><circle cx="9" cy="29" r="4" fill="currentColor" /><circle cx="15" cy="11" r="4" fill="currentColor" /><circle cx="25" cy="26" r="4" fill="currentColor" /><circle cx="31" cy="9" r="4" fill="currentColor" /></>}
    {type === 'trio' && <><circle cx="20" cy="20" r="8" fill="currentColor" /><path d="M20 3v5M20 32v5M3 20h5M32 20h5M8 8l3.5 3.5M28.5 28.5 32 32M32 8l-3.5 3.5M11.5 28.5 8 32" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /></>}
    {type === 'tents' && <><path d="M4 30 16.5 9 29 30H4Z" fill="currentColor" /><path d="m16.5 9 12.5 21H36L23.5 9h-7Z" fill="currentColor" opacity=".65" /><path d="M13 30 17 22l4 8" fill="var(--motif-wash)" /></>}
    {(type === 'sudoku' || type === 'killer-sudoku') && <><rect x="6" y="6" width="28" height="28" rx="4" stroke="currentColor" strokeWidth="2.5" />{type === 'sudoku'
      ? <path d="M15.5 6v28M24.5 6v28M6 15.5h28M6 24.5h28" stroke="currentColor" strokeWidth="2" />
      : <><path d="M16 6v11h8v17M6 17h10M24 23h10" stroke="currentColor" strokeWidth="2" strokeDasharray="3 2" /><circle cx="11" cy="11" r="1.5" fill="currentColor" /></>}</>}
    {type === 'nurikabe' && <><path d="M4 4h9v9H4zm11.5 0h9v9h-9zm0 11.5h9v9h-9zM27 27h9v9h-9z" fill="currentColor" /><path d="M27 4h9v9h-9zM4 15.5h9v9H4zm23 0h9v9h-9zM4 27h9v9H4zm11.5 0h9v9h-9z" fill="currentColor" opacity=".5" /></>}
  </svg>
}

export function FeaturedArtwork({ type }: { readonly type: PuzzleType }) {
  return <div className={`featured-art game-${type}`} aria-hidden="true">
    <span className="featured-tile featured-tile-left">{type === 'trio'
      ? <svg viewBox="0 0 40 40" fill="currentColor"><path d="M30 26A14 14 0 0 1 15 5a15 15 0 1 0 15 21Z" /></svg>
      : <GameIcon type={type} />}</span>
    <span className="featured-tile featured-tile-center"><GameIcon type={type} /></span>
    <span className="featured-tile featured-tile-right"><GameIcon type={type === 'trio' ? 'star-battle' : type} /></span>
  </div>
}
