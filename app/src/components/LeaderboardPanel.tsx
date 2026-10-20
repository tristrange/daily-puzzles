import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatTime } from '../domain/game'
import { readLeaderboard, type LeaderboardSnapshot } from '../lib/leaderboard'
import { useLeaderboard } from '../lib/useLeaderboard'
import type { SolveRecord } from '../lib/stats'
import { JoinLeaderboard } from './JoinLeaderboard'

export function LeaderboardTable({ board }: { board: LeaderboardSnapshot }) {
  if (!board.entries.length) return <p className="status">No results yet. Be the first to publish one.</p>
  const rows = [...board.entries, ...(board.own_entry ? [board.own_entry] : [])]
  return <>
    <table className="leaderboard-table">
      <caption className="sr-only">Puzzle results, ranked by hints used then elapsed time</caption>
      <thead><tr><th scope="col">Rank</th><th scope="col">Player</th><th scope="col">Time</th><th scope="col">Hints</th></tr></thead>
      <tbody>{rows.map((entry, position) => <tr key={position} className={`${entry.is_you ? 'is-you' : ''}${position === board.entries.length ? ' own-outside' : ''}`}>
        <td>{entry.rank}</td><th scope="row">{entry.nickname}{entry.is_you && <span className="leaderboard-you">You</span>}</th><td>{formatTime(entry.elapsed_ms)}</td><td>{entry.hints}</td>
      </tr>)}</tbody>
    </table>
    <p className="leaderboard-note">{board.total} player{board.total === 1 ? '' : 's'} · Fewest hints, then fastest time. Tied scores share rank.</p>
  </>
}

type LoadState = { key: string; board: LeaderboardSnapshot } | { key: string; error: string }
export function LeaderboardPanel({ puzzleId, candidate }: { puzzleId: string; candidate?: SolveRecord | null | undefined }) {
  const leaderboard = useLeaderboard()
  const [refresh, setRefresh] = useState(0)
  const [loaded, setLoaded] = useState<LoadState | null>(null)
  const [joining, setJoining] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine)
  const { client, status, resultsRevision, resultsPuzzleId } = leaderboard
  const changed = resultsPuzzleId === null || resultsPuzzleId === puzzleId ? resultsRevision : -1
  const requestKey = `${puzzleId}:${refresh}:${status}:${changed}`
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine)
    window.addEventListener('online', update); window.addEventListener('offline', update)
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update) }
  }, [])
  useEffect(() => {
    let current = true
    if (client && !offline) readLeaderboard(client, puzzleId).then(
      board => { if (current) setLoaded({ key: requestKey, board }) },
      error => { if (current) setLoaded({ key: requestKey, error: error instanceof Error ? error.message : 'Leaderboard unavailable. Please try again.' }) },
    )
    return () => { current = false }
  }, [client, puzzleId, requestKey, offline])
  const active = loaded?.key === requestKey ? loaded : null
  return <section className="leaderboard-panel" aria-label="Puzzle leaderboard">
    <div className="leaderboard-heading"><h2>Leaderboard</h2><Link to={`/leaderboards?id=${puzzleId}`}>View all ↗</Link></div>
    {status === 'disabled' ? <p className="status">Leaderboards are not configured. You can keep playing and saving local Stats.</p>
      : <>
        {offline ? <p className="status" role="status">You’re offline. Connect to view rankings; you can keep playing saved puzzles.</p>
          : !active ? <p className="status" role="status">Loading leaderboard…</p>
            : 'error' in active ? <p className="status" role="status">{active.error}</p> : <LeaderboardTable board={active.board} />}
        <div className="leaderboard-actions">
          <button className="tool-button" type="button" disabled={offline} onClick={() => setRefresh(value => value + 1)}>Refresh</button>
          {status !== 'loading' && <button className="tool-button" type="button" disabled={offline || removing} onClick={() => setJoining(value => !value)}>{status === 'on' ? 'Change nickname' : 'Join leaderboard'}</button>}
          {status === 'on' && <button className="tool-button" type="button" onClick={() => { leaderboard.stop(); setJoining(false) }}>Stop publishing</button>}
          {leaderboard.pendingCount > 0 && <button className="tool-button" type="button" disabled={offline || status !== 'on'} onClick={() => { void leaderboard.retry() }}>Retry {leaderboard.pendingCount} pending</button>}
        </div>
        {joining && <JoinLeaderboard candidate={candidate} onClose={() => setJoining(false)} />}
        {leaderboard.message && <p className="status" role="status">{leaderboard.message}</p>}
        {leaderboard.nickname && <div className="leaderboard-remove">
          {confirming ? <>
            <p>Remove all results published with this browser’s player identity? Local Stats stay unchanged. Publishing will stop.</p>
            <div className="leaderboard-actions"><button type="button" className="tool-button danger" disabled={removing} onClick={async () => {
              setRemoving(true); setJoining(false)
              try { await leaderboard.removeResults(); setConfirming(false) } catch { /* The shared status reports the failure. */ }
              finally { setRemoving(false) }
            }}>{removing ? 'Removing…' : 'Yes, remove my results'}</button><button type="button" className="tool-button" disabled={removing} onClick={() => setConfirming(false)}>Keep results</button></div>
          </> : <button type="button" className="tool-button" onClick={() => setConfirming(true)}>Remove my published results</button>}
        </div>}
      </>}
    <p className="leaderboard-note">Scores are community-reported, not independently verified. Joining is optional; playing and local Stats work without it.</p>
  </section>
}
