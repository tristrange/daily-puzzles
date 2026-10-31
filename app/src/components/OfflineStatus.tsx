import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { PUZZLE_DOWNLOAD_FAILED, registerOfflineApp } from '../lib/offline'
import type { OfflineUpdate } from '../lib/offline'

const reloadPage = () => window.location.reload()
const UPDATE_TIMEOUT = 12_000

export function OfflineStatus({ reload = reloadPage }: { readonly reload?: () => void } = {}) {
  const { pathname, key: locationKey } = useLocation()
  const [online, setOnline] = useState(() => navigator.onLine)
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || document.visibilityState === 'visible')
  const [update, setUpdate] = useState<OfflineUpdate | null>(null)
  const [applying, setApplying] = useState(false)
  const [updateFailed, setUpdateFailed] = useState(false)
  const [downloadFailed, setDownloadFailed] = useState(false)
  const requested = useRef(false)
  const requestLocation = useRef(locationKey)
  const currentLocation = useRef(locationKey)
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useLayoutEffect(() => { currentLocation.current = locationKey }, [locationKey])

  useEffect(() => {
    const abort = new AbortController()
    const setConnection = () => setOnline(navigator.onLine)
    const setVisibility = () => setVisible(document.visibilityState === 'visible')
    const warn = () => setDownloadFailed(true)
    window.addEventListener(PUZZLE_DOWNLOAD_FAILED, warn)
    window.addEventListener('online', setConnection)
    window.addEventListener('offline', setConnection)
    window.addEventListener('pageshow', setVisibility)
    document.addEventListener('visibilitychange', setVisibility)
    if (import.meta.env.PROD) {
      void registerOfflineApp((next) => {
        if (next.kind === 'active' && requested.current) {
          clearTimeout(timeout.current)
          requested.current = false
          setApplying(false)
          if (requestLocation.current === currentLocation.current) {
            reload()
            return
          }
        }
        if (next.kind === 'active') setUpdateFailed(false)
        setUpdate((current) => current?.kind === 'active' ? current : next)
      }, abort.signal)
    }
    return () => {
      abort.abort()
      clearTimeout(timeout.current)
      window.removeEventListener(PUZZLE_DOWNLOAD_FAILED, warn)
      window.removeEventListener('online', setConnection)
      window.removeEventListener('offline', setConnection)
      window.removeEventListener('pageshow', setVisibility)
      document.removeEventListener('visibilitychange', setVisibility)
    }
  }, [reload])

  const applyUpdate = useCallback(() => {
    if (!update || requested.current) return
    requested.current = true
    requestLocation.current = locationKey
    setUpdateFailed(false)
    if (update.kind === 'active') {
      reload()
      return
    }
    setApplying(true)
    if (!update.activate()) {
      requested.current = false
      setApplying(false)
      setUpdateFailed(true)
      return
    }
    timeout.current = setTimeout(() => {
      requested.current = false
      setApplying(false)
      setUpdateFailed(true)
    }, UPDATE_TIMEOUT)
  }, [locationKey, reload, update])

  // Today contains no in-progress board or lesson, so it is safe to refresh.
  useEffect(() => {
    if (pathname !== '/' || !visible || !update || updateFailed) return
    let cancelled = false
    queueMicrotask(() => { if (!cancelled) applyUpdate() })
    return () => { cancelled = true }
  }, [applyUpdate, pathname, update, updateFailed, visible])

  return <OfflineMessage online={online} updateReady={update !== null} applying={applying}
    updateFailed={updateFailed} downloadFailed={downloadFailed} onUpdate={applyUpdate} />
}

export function OfflineMessage({ online, updateReady, applying = false, updateFailed = false, downloadFailed, onUpdate }: {
  readonly online: boolean
  readonly updateReady: boolean
  readonly applying?: boolean
  readonly updateFailed?: boolean
  readonly downloadFailed: boolean
  readonly onUpdate?: () => void
}) {
  return (
    <div className="offline-status" role="status">
      {!online && <>Offline · Play saved puzzles in the <Link to="/archive">archive</Link>.</>}
      {downloadFailed && ' Some puzzles could not be saved on this device. Keep a connection to play them.'}
      {updateReady && <>
        {' A new version is ready. '}
        <button type="button" onClick={onUpdate} disabled={applying}>{applying ? 'Updating…' : 'Update now'}</button>
        {' '}<span className="offline-update-note">Updating reloads this page and clears undo and redo history.</span>
      </>}
      {updateFailed && ' Update did not finish. Please try again.'}
    </div>
  )
}
