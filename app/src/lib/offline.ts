export const PUZZLE_DOWNLOAD_FAILED = 'puzzle-download-failed'

export type OfflineUpdate =
  | { readonly kind: 'waiting'; readonly activate: () => boolean }
  | { readonly kind: 'active' }

const UPDATE_CHECK_INTERVAL = 5 * 60 * 1000

/** Registration failure must never prevent ordinary online play. */
export async function registerOfflineApp(
  onUpdate: (update: OfflineUpdate) => void = () => {},
  signal?: AbortSignal,
): Promise<boolean> {
  if (!('serviceWorker' in navigator) || signal?.aborted) return false
  const serviceWorker = navigator.serviceWorker
  let controller = serviceWorker.controller
  const cleanups: (() => void)[] = []
  const cleanup = () => { for (const remove of cleanups.splice(0)) remove() }
  const listen = (target: EventTarget, type: string, listener: () => void) => {
    target.addEventListener(type, listener)
    cleanups.push(() => target.removeEventListener(type, listener))
  }
  try {
    const registration = await serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
      scope: import.meta.env.BASE_URL, updateViaCache: 'none',
    })
    if (signal?.aborted) return false
    signal?.addEventListener('abort', cleanup, { once: true })
    let lastCheck = Date.now()
    const activate = () => {
      try {
        if (!registration.waiting) return false
        registration.waiting.postMessage({ type: 'ACTIVATE_UPDATE' })
        return true
      } catch { return false }
    }
    const announce = () => {
      if (registration.waiting !== null && serviceWorker.controller !== null) {
        onUpdate({ kind: 'waiting', activate })
      }
    }
    const checkController = () => {
      const next = serviceWorker.controller
      if (next !== controller) {
        const hadController = controller !== null
        controller = next
        // The first installation claims a page already running the new build.
        if (hadController && next !== null) onUpdate({ kind: 'active' })
      }
    }
    const watched = new WeakSet<ServiceWorker>()
    const watchInstalling = (worker: ServiceWorker | null) => {
      if (worker === null || watched.has(worker)) return
      watched.add(worker)
      listen(worker, 'statechange', () => { if (worker.state === 'installed') announce() })
      if (worker.state === 'installed') announce()
    }
    const foreground = () => {
      checkController()
      announce()
      if (document.visibilityState !== 'visible' || !navigator.onLine || Date.now() - lastCheck < UPDATE_CHECK_INTERVAL) return
      lastCheck = Date.now()
      void registration.update().catch(() => {})
    }
    listen(serviceWorker, 'controllerchange', checkController)
    listen(registration, 'updatefound', () => watchInstalling(registration.installing))
    listen(window, 'focus', foreground)
    listen(window, 'pageshow', foreground)
    listen(document, 'visibilitychange', foreground)
    checkController()
    announce()
    watchInstalling(registration.installing)
    await serviceWorker.ready
    return true
  } catch {
    cleanup()
    return false
  }
}
