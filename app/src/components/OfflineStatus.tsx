import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { registerOfflineApp } from '../lib/offline'

export function OfflineStatus() {
  const [online, setOnline] = useState(() => navigator.onLine)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let cancelled = false
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    if (import.meta.env.PROD) {
      void registerOfflineApp().then((available) => { if (!cancelled) setReady(available) })
    }
    return () => {
      cancelled = true
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  return (
    <p className="offline-status" role="status">
      {!online ? <>Offline · Play previously opened puzzles in the <Link to="/archive">archive</Link>.</>
        : ready ? 'App ready offline. Open puzzles online to save them.' : null}
    </p>
  )
}
