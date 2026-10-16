import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PUZZLE_DOWNLOAD_FAILED, registerOfflineApp } from '../lib/offline'

export function OfflineStatus() {
  const [online, setOnline] = useState(() => navigator.onLine)
  const [ready, setReady] = useState(false)
  const [downloadFailed, setDownloadFailed] = useState(false)
  useEffect(() => {
    let cancelled = false
    const update = () => setOnline(navigator.onLine)
    const warn = () => setDownloadFailed(true)
    window.addEventListener(PUZZLE_DOWNLOAD_FAILED, warn)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    if (import.meta.env.PROD) {
      void registerOfflineApp().then((available) => { if (!cancelled) setReady(available) })
    }
    return () => {
      cancelled = true
      window.removeEventListener(PUZZLE_DOWNLOAD_FAILED, warn)
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  return <OfflineMessage online={online} ready={ready} downloadFailed={downloadFailed} />
}

export function OfflineMessage({ online, ready, downloadFailed }: {
  readonly online: boolean
  readonly ready: boolean
  readonly downloadFailed: boolean
}) {
  return (
    <p className="offline-status" role="status">
      {!online ? <>Offline · Play saved puzzles in the <Link to="/archive">archive</Link>.</>
        : ready ? <>App ready offline.{!downloadFailed && ' Open puzzles online to save them.'}</> : null}
      {downloadFailed && ' Some puzzles could not be saved on this device. Keep a connection to play them.'}
    </p>
  )
}
