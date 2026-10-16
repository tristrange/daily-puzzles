export const PUZZLE_DOWNLOAD_FAILED = 'puzzle-download-failed'

/** Registration failure must never prevent ordinary online play. */
export async function registerOfflineApp(): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false
  try {
    await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, {
      scope: import.meta.env.BASE_URL, updateViaCache: 'none',
    })
    await navigator.serviceWorker.ready
    return true
  } catch { return false }
}
