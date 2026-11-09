import type { PuzzleType } from '../domain/board'
import './GameArtwork.css'

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

/** Small illustrated boards for the catalogue. These are decorative examples. */
export function GamePlate({ type }: { readonly type: PuzzleType }) {
  return <span className={`game-plate plate-${type}`} aria-hidden="true">
    <svg viewBox="0 0 84 84" fill="none" focusable="false">
      {type !== 'queens' && <path d="M10 10h64v64H10z M26 10v64m16-64v64m16-64v64M10 26h64M10 42h64M10 58h64"
        stroke="currentColor" strokeWidth=".7" opacity=".42" />}
      {type === 'queens' && <>
        <path d="M10 10h25v25H22v13H10z" fill="#aac1de" />
        <path d="M36 10h38v25H62V22H48v13H36z" fill="#e8b66a" />
        <path d="M49 23h12v13h13v12H61v13H49V48H36V36h13z" fill="#e59783" />
        <path d="M23 36h12v13h13v12H35v13H10V49h13z" fill="#9cbfb0" />
        <path d="M62 49h12v25H36V62h26z" fill="#c6b3d7" />
        <g fill="#25344a">
          <path d="m38 14 3 2 2-4 2 4 3-2-1 6h-8zm-26 13 3 2 2-4 2 4 3-2-1 6h-8zm39 26 3 2 2-4 2 4 3-2-1 6h-8z" />
        </g>
      </>}
      {type === 'star-battle' && <>
        <path d="m18 52 25-21 24 27" stroke="currentColor" />
        <path d="m18 44 2 6 6 2-6 2-2 6-2-6-6-2 6-2zm49 4 2 7 8 3-8 2-2 8-2-8-8-2 8-3zm-4-38 1 4 5 2-5 1-1 5-2-5-4-1 4-2z" fill="currentColor" />
        <path d="m43 17 3.6 9.7 10.4.4-8.2 6.4 2.9 10-8.7-5.8-8.7 5.8 2.9-10-8.2-6.4 10.4-.4z" fill="#fff4d9" />
      </>}
      {type === 'word-paths' && <>
        <path d="m18 50 16-16h16l16 16" stroke="currentColor" strokeWidth="3" />
        {[['P', 18, 50], ['A', 34, 34], ['T', 50, 34], ['H', 66, 50]].map(([letter, x, y]) =>
          <g key={letter}><circle cx={x} cy={y} r="8" fill="currentColor" />
            <text x={x} y={y} dy=".34em" className="plate-inverse">{letter}</text></g>)}
      </>}
      {type === 'trio' && <>
        <circle cx="20" cy="43" r="7" fill="currentColor" />
        <path d="M20 30v4m0 18v4M7 43h4m18 0h4M11 34l3 3m12 12 3 3m0-18-3 3M14 49l-3 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M48 45a10 10 0 0 1-9-15 10 10 0 1 0 11 14z" fill="#fff4d9" />
        <path d="m64 36 3 8h9l-7 5 2 9-7-5-7 5 2-9-7-5h9z" fill="currentColor" />
      </>}
      {type === 'tents' && <>
        <path d="M15 61 32 33 49 61H38l-6-13-6 13z" fill="currentColor" />
        <path d="M46 50 59 22 72 50H61v8h-4v-8z" fill="#fff4d9" />
      </>}
      {type === 'nurikabe' && <>
        <path d="M11 11h14v14H11zm16 0h14v14H27zm0 16h14v14H27zm32 0h14v14H59zM11 59h14v14H11zm32 0h14v14H43zm16 0h14v14H59z" fill="currentColor" />
        <text x="18" y="22" className="plate-inverse">3</text><text x="66" y="38" className="plate-inverse">1</text><text x="50" y="70" className="plate-inverse">2</text>
      </>}
      {type === 'train-tracks' && <>
        <path d="M16 19h16m-16 8h16m-16 8h16m-16 8h16m8 11v16m8-16v16m8-16v16m8-16v16m8-16v16" stroke="currentColor" strokeWidth="2" />
        <path d="M20 11v31q0 24 20 24h37M28 11v31q0 16 12 16h37" stroke="#fff4d9" strokeWidth="2" />
      </>}
      {type === 'sudoku' && <>
        <path d="M26 26h16v16H26zm32 16h16v16H58z" fill="currentColor" />
        <text x="18" y="22">4</text><text x="34" y="38" className="plate-inverse">9</text><text x="66" y="54" className="plate-inverse">2</text><text x="50" y="70">7</text>
      </>}
      {type === 'killer-sudoku' && <>
        <path d="M13 13h27v27H13z" stroke="currentColor" strokeWidth="1.2" strokeDasharray="3 2" />
        <path d="M58 42h16v16H58z" fill="currentColor" />
        <text x="24" y="26">12</text><text x="66" y="54" className="plate-inverse">8</text>
      </>}
    </svg>
  </span>
}
