import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PUZZLE_DOWNLOAD_FAILED, registerOfflineApp } from '../lib/offline'

export function OfflineStatus() {
  const [online, setOnline] = useState(() => navigator.onLine)
  const [updateReady, setUpdateReady] = useState(false)
  const [downloadFailed, setDownloadFailed] = useState(false)
  useEffect(() => {
    let cancelled = false
    const update = () => setOnline(navigator.onLine)
    const warn = () => setDownloadFailed(true)
    window.addEventListener(PUZZLE_DOWNLOAD_FAILED, warn)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    if (import.meta.env.PROD) {
      void registerOfflineApp(() => { if (!cancelled) setUpdateReady(true) })
    }
    return () => {
      cancelled = true
      window.removeEventListener(PUZZLE_DOWNLOAD_FAILED, warn)
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  return <OfflineMessage online={online} updateReady={updateReady} downloadFailed={downloadFailed} />
}

export function OfflineMessage({ online, updateReady, downloadFailed }: {
  readonly online: boolean
  readonly updateReady: boolean
  readonly downloadFailed: boolean
}) {
  return (
    <p className="offline-status" role="status">
      {!online && <>Offline · Play saved puzzles in the <Link to="/archive">archive</Link>.</>}
      {downloadFailed && ' Some puzzles could not be saved on this device. Keep a connection to play them.'}
      {updateReady && ' A new version is ready. Close every open app window to update.'}
    </p>
  )
}
