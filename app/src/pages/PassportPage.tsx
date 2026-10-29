import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { PUZZLE_PIECE, PUZZLE_TYPE_LABEL } from '../domain/games'
import { PASSPORT_MILESTONES, passportProgress } from '../lib/passport'
import { readStoredStats } from '../lib/stats'

export function PassportPage() {
  const [records, setRecords] = useState(readStoredStats)
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    window.scrollTo({ top: 0 })
    heading.current?.focus({ preventScroll: true })
  }, [])
  useEffect(() => {
    const refresh = () => setRecords(readStoredStats())
    const onVisibility = () => { if (!document.hidden) refresh() }
    window.addEventListener('focus', refresh)
    window.addEventListener('pageshow', refresh)
    window.addEventListener('storage', refresh)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('focus', refresh)
      window.removeEventListener('pageshow', refresh)
      window.removeEventListener('storage', refresh)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  const { stamps, earned, total, explorer } = passportProgress(records)
  return <section className="passport-page">
    <Link className="passport-back" to="/stats">← Your stats</Link>
    <h1 className="page-title" ref={heading} tabIndex={-1}>Puzzle Passport</h1>
    <p className="page-intro">Collect a stamp for each game you solve, then grow your collection as you play.</p>
    <div className="passport-summary">
      <strong>{earned} of {total}</strong> game stamps collected
      <progress aria-label="Game stamps collected" value={earned} max={total || 1} />
    </div>
    <ul className="passport-stamps" aria-label="Game stamps">
      {stamps.map(({ type, count }) => <li key={type} className={`passport-stamp game-${type}`}>
        <div className="passport-stamp-heading">
          <span className={`passport-symbol${count === 0 ? ' locked' : ''}`} aria-hidden="true">{PUZZLE_PIECE[type].glyph}</span>
          <div>
            <h2>{PUZZLE_TYPE_LABEL[type]}</h2>
            <p>{count > 0 ? 'Stamp earned' : 'Not collected yet'} · {count} puzzle{count === 1 ? '' : 's'} solved</p>
          </div>
        </div>
        <ul className="passport-milestones" aria-label={`${PUZZLE_TYPE_LABEL[type]} milestones`}>
          {PASSPORT_MILESTONES.map(milestone => <li key={milestone}
            className={count >= milestone ? 'earned' : ''}
            aria-label={`${milestone} ${milestone === 1 ? 'puzzle' : 'puzzles'}: ${count >= milestone ? 'earned' : 'not yet earned'}`}>
            {count >= milestone && <span aria-hidden="true">✓ </span>}{milestone} {milestone === 1 ? 'solve' : 'solves'}
          </li>)}
        </ul>
      </li>)}
    </ul>
    <section className="passport-explorer" aria-labelledby="passport-explorer-heading">
      <div className="passport-explorer-symbol" aria-hidden="true">✦</div>
      <div>
        <h2 id="passport-explorer-heading">Explorer {explorer && <span>· Earned</span>}</h2>
        <p>{explorer ? 'You have collected a stamp for every game.' : 'Collect a stamp for every game to become an Explorer.'}</p>
      </div>
    </section>
    <p className="passport-footnote">Daily and archive puzzles count once each, including solves with hints. Previews do not count. Your passport uses the solve history saved in this browser; export your stats to back it up.</p>
  </section>
}
