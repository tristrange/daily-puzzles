export const PUZZLE_DOWNLOAD_FAILED = 'puzzle-download-failed'

/**
 * Registration failure must never prevent ordinary online play. A worker that
 * finishes installing is reported once through `onUpdateReady`; it still waits
 * for every app window to close, so the caller shows a notice rather than
 * reloading a board in progress.
 */
export async function registerOfflineApp(onUpdateReady: () => void = () => {}): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false
  try {
    const registration = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
      scope: import.meta.env.BASE_URL, updateViaCache: 'none',
    })
    const announce = () => {
      if (registration.waiting !== null && navigator.serviceWorker.controller !== null) {
        onUpdateReady()
      }
    }
    const watchInstalling = (worker: ServiceWorker | null) => {
      if (worker === null) return
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed') announce()
      })
    }
    announce()
    watchInstalling(registration.installing)
    registration.addEventListener?.('updatefound', () => watchInstalling(registration.installing))
    await navigator.serviceWorker.ready
    return true
  } catch { return false }
}
