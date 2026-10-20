import { useEffect, useId, useRef, useState } from 'react'
import { isLeaderboardNickname } from '../lib/leaderboard'
import { useLeaderboard } from '../lib/useLeaderboard'
import type { SolveRecord } from '../lib/stats'

type Widget = { render: (container: HTMLElement, options: Record<string, unknown>) => string; remove: (id: string) => void }
declare global { interface Window { turnstile?: Widget } }
let loading: Promise<Widget> | null = null
function loadWidget(): Promise<Widget> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (!loading) loading = new Promise<Widget>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
    script.async = true
    script.onload = () => { if (window.turnstile) resolve(window.turnstile); else { script.remove(); loading = null; reject(Error('Verification unavailable.')) } }
    script.onerror = () => { script.remove(); loading = null; reject(Error('Verification unavailable. Check your connection and try again.')) }
    document.head.append(script)
  })
  return loading
}

export function JoinLeaderboard({ candidate, onClose }: { candidate?: SolveRecord | null | undefined; onClose: () => void }) {
  const leaderboard = useLeaderboard()
  const [nickname, setNickname] = useState(leaderboard.nickname)
  const [consent, setConsent] = useState(false)
  const [token, setToken] = useState('')
  const [message, setMessage] = useState('Loading verification…')
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const container = useRef<HTMLDivElement>(null)
  const nicknameId = useId(), consentId = useId()
  const siteKey = leaderboard.config?.siteKey
  useEffect(() => {
    let mounted = true, widget: Widget | null = null, id: string | null = null
    if (siteKey) loadWidget().then(api => {
      if (!mounted || !container.current) return
      widget = api
      id = api.render(container.current, { sitekey: siteKey, size: 'compact', theme: 'auto', retry: 'never', 'refresh-expired': 'manual',
        callback: (value: string) => { setToken(value); setMessage('Verification complete.') },
        'expired-callback': () => { setToken(''); setMessage('Verification expired. Try again.') },
        'error-callback': (code: string) => { setToken(''); setMessage(code === '110200' ? 'Verification is not available at this address.' : 'Verification unavailable. Check your connection and try again.') },
      })
      setMessage('Complete verification below.')
    }).catch(() => { if (mounted) setMessage('Verification unavailable. Check your connection and try again.') })
    return () => { mounted = false; if (widget && id !== null) widget.remove(id) }
  }, [siteKey, attempt])
  return <form className="leaderboard-join" onSubmit={async event => {
    event.preventDefault()
    if (!consent || !token || !isLeaderboardNickname(nickname.trim()) || busy) return
    setBusy(true)
    try { await leaderboard.join(nickname, token, candidate ?? undefined); onClose() }
    catch (error) { setToken(''); setAttempt(value => value + 1); setMessage(error instanceof Error ? error.message : 'Could not join. Please retry.') }
    finally { setBusy(false) }
  }}>
    <label htmlFor={nicknameId}>Nickname</label>
    <input id={nicknameId} name="nickname" autoComplete="nickname" value={nickname} minLength={2} maxLength={20}
      pattern="[-A-Za-z0-9_ ]{2,20}" required disabled={busy} onChange={event => setNickname(event.target.value)} />
    <p className="leaderboard-note">2–20 letters, numbers, spaces, underscores or hyphens. Names aren’t reserved.</p>
    <label className="leaderboard-consent" htmlFor={consentId}>
      <input id={consentId} type="checkbox" checked={consent} disabled={busy} onChange={event => setConsent(event.target.checked)} />
      <span>Publish my nickname, puzzle, time and hints {candidate ? 'for this result and future first solves' : 'for future first solves'}. No earlier history is uploaded.</span>
    </label>
    <p className="leaderboard-note">Supabase stores published results and an anonymous player identity. Cloudflare verifies joining. Clearing browser data loses access to that identity; there is no device sync or recovery.</p>
    <div ref={container} className="leaderboard-verification" />
    <p className="status" role="status">{message}</p>
    <div className="leaderboard-actions">
      <button className="tool-button primary" type="submit" disabled={busy || !consent || !token || !isLeaderboardNickname(nickname.trim())}>{busy ? 'Joining…' : 'Enable publishing'}</button>
      {!token && <button className="tool-button" type="button" disabled={busy} onClick={() => { setToken(''); setAttempt(value => value + 1) }}>Try verification again</button>}
      <button className="tool-button" type="button" disabled={busy} onClick={onClose}>Cancel</button>
    </div>
  </form>
}
