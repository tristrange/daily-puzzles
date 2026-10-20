import type { SupabaseClient } from '@supabase/supabase-js'
import type { SolveRecord } from './stats'
import { isPuzzleId } from '../domain/dates'
import { isLeaderboardNickname, isScoreNumber, removeLeaderboardResults, submitLeaderboardResult, type LeaderboardConfig, type LeaderboardResult } from './leaderboard'

type StoragePort = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
type Progress = { project: string; owner: string | null; enabled: boolean; nickname: string; pending: LeaderboardResult[] }
export type LeaderboardStatus = 'disabled' | 'loading' | 'off' | 'on' | 'lost'
export type LeaderboardState = { readonly status: LeaderboardStatus; readonly nickname: string; readonly pendingCount: number; readonly message: string; readonly revision: number }
export function leaderboardProgressKey(url: string): string { return `daily-puzzles:leaderboard:participation:${new URL(url).hostname}` }

function parse(raw: string | null, project: string): Progress {
  const empty: Progress = { project, owner: null, enabled: false, nickname: '', pending: [] }
  if (!raw) return empty
  try {
    const saved = JSON.parse(raw) as Progress
    if (!saved || saved.project !== project || typeof saved.enabled !== 'boolean' || typeof saved.owner !== 'string'
      || !saved.owner || !isLeaderboardNickname(saved.nickname) || !Array.isArray(saved.pending) || saved.pending.length > 100
      || saved.pending.some(result => !result || !isPuzzleId(result.id) || !isLeaderboardNickname(result.nickname)
        || !isScoreNumber(result.elapsedMs) || !isScoreNumber(result.hints))
      || new Set(saved.pending.map(result => result.id)).size !== saved.pending.length) return empty
    return { ...saved, pending: saved.enabled ? saved.pending : [] }
  } catch { return empty }
}

export function createLeaderboardStore(config: LeaderboardConfig | null, client: SupabaseClient | null, storage: StoragePort | null) {
  const key = config ? leaderboardProgressKey(config.url) : ''
  let saved = parse(null, config?.url ?? '')
  let storageFailed = false
  const load = () => {
    try { return parse(storage?.getItem(key) ?? null, config?.url ?? '') }
    catch { storageFailed = true; return saved }
  }
  saved = load()
  let identity: string | null = null
  let stopped = false, joining = false, removing = false, generation = 0
  let notice = '', overflow = false
  let draining: Promise<void> | null = null
  let state: LeaderboardState = { status: config && client ? 'loading' : 'disabled', nickname: saved.nickname, pendingCount: saved.pending.length, message: '', revision: 0 }
  const listeners = new Set<() => void>()
  const emit = () => {
    const status: LeaderboardStatus = !config || !client ? 'disabled' : !saved.enabled || stopped || storageFailed ? 'off'
      : saved.owner === identity && identity !== null ? 'on' : 'lost'
    state = { status, nickname: saved.nickname, pendingCount: saved.pending.length,
      message: overflow ? 'Pending uploads are full. This solve was saved locally but not queued.' : notice, revision: state.revision + 1 }
    for (const listener of listeners) listener()
  }
  const persist = (next: Progress) => {
    if (!storage) throw Error('Browser storage is unavailable. Publishing cannot be enabled.')
    storage.setItem(key, JSON.stringify(next))
    saved = next
  }
  const storageError = () => { storageFailed = true; notice = 'Browser storage is unavailable. Publishing is stopped; local play still works.'; emit() }
  const verifyIdentity = async () => {
    if (!client) return
    const { data, error } = await client.auth.getSession()
    identity = error ? null : data.session?.user.id ?? null
    saved = load()
    if (saved.enabled && identity !== saved.owner) notice = 'Your player session is unavailable. Join again to publish; old pending results will not move to a new identity.'
    emit()
  }
  const retry = (): Promise<void> => {
    if (!client || !config) return Promise.resolve()
    if (draining) return draining
    draining = (async () => {
      try {
        await verifyIdentity()
        while (!stopped && !storageFailed) {
          saved = load()
          if (!saved.enabled || !identity || saved.owner !== identity || !saved.pending.length) break
          const result = saved.pending[0]!, owner = saved.owner
          await submitLeaderboardResult(client, result, owner)
          const latest = load()
          if (!latest.enabled || latest.owner !== owner || stopped || storageFailed) break
          persist({ ...latest, pending: latest.pending.filter(entry => entry.id !== result.id) })
          notice = 'Result published.'
          emit()
        }
      } catch {
        if (!stopped && saved.enabled && !storageFailed) notice = 'Results are pending. Connect and use Retry to publish them.'
        emit()
      }
    })().finally(() => { draining = null })
    return draining
  }
  const offerSolve = (record: SolveRecord) => {
    if (!config || !client || stopped || removing || storageFailed) return
    saved = load()
    if (!saved.enabled || saved.owner !== identity || !identity || saved.pending.some(result => result.id === record.id)) return
    if (!isPuzzleId(record.id) || !isScoreNumber(record.elapsedMs) || !isScoreNumber(record.hints)) return
    if (saved.pending.length >= 100) { overflow = true; emit(); return }
    try {
      persist({ ...saved, pending: [...saved.pending, { id: record.id, nickname: saved.nickname, elapsedMs: record.elapsedMs, hints: record.hints }] })
      notice = 'Result queued.'; emit()
      void retry()
    } catch { storageError() }
  }
  const stop = () => {
    generation++; stopped = true; overflow = false
    saved = { ...load(), enabled: false, pending: [] }
    try { persist(saved); notice = 'Publishing stopped. Already published results remain; an in-flight request may still finish.' }
    catch { notice = 'Publishing stopped here, but browser storage could not save that setting.' }
    emit()
  }
  const join = async (nickname: string, captchaToken: string, candidate?: SolveRecord) => {
    const name = nickname.trim()
    if (!client || !config || !isLeaderboardNickname(name) || !captchaToken || joining || removing) throw Error('Enter a valid nickname and complete verification.')
    try {
      if (!storage) throw Error()
      storage.setItem(`${key}:check`, '1')
      if (storage.getItem(`${key}:check`) !== '1') throw Error()
      storage.removeItem(`${key}:check`)
    } catch { throw Error('Browser storage is unavailable. Publishing cannot be enabled.') }
    joining = true
    const attempt = ++generation
    try {
      const current = await client.auth.getSession()
      if (current.error) throw Error('Player session unavailable. Reconnect and try again.')
      const signed = current.data.session ? { data: current.data, error: null }
        : await client.auth.signInAnonymously({ options: { captchaToken } })
      if (signed.error || !signed.data.session) throw Error('Could not join. Complete verification again and retry.')
      if (attempt !== generation) return
      identity = signed.data.session.user.id
      const latest = load()
      persist({ project: config.url, owner: identity, enabled: true, nickname: name,
        pending: latest.owner === identity ? latest.pending : [] })
      stopped = false; storageFailed = false; overflow = false; notice = 'Publishing enabled for future first solves.'; emit()
      if (candidate) offerSolve(candidate)
      await retry()
    } catch (error) { emit(); throw error }
    finally { joining = false }
  }
  const removeResults = async () => {
    if (!client || removing) return
    removing = true
    stop()
    try {
      if (draining) await draining
      await verifyIdentity()
      if (!identity || identity !== saved.owner) throw Error('The original player session is required to remove these results.')
      await removeLeaderboardResults(client, saved.owner!)
      notice = 'Your published results have been removed.'; emit()
    } catch (error) { notice = error instanceof Error ? error.message : 'Could not remove results. Please retry.'; emit(); throw error }
    finally { removing = false }
  }
  const start = () => {
    if (!client || !config) return () => {}
    const online = () => { void retry() }
    const changed = (event: StorageEvent) => {
      if (event.key !== null && event.key !== key) return
      saved = load(); stopped = !saved.enabled; generation++; emit()
      if (saved.enabled) void retry()
    }
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      identity = session?.user.id ?? null
      emit()
      if (saved.enabled && saved.owner === identity) queueMicrotask(online)
    })
    if (typeof window !== 'undefined') {
      window.addEventListener('online', online)
      window.addEventListener('storage', changed)
    }
    void retry()
    return () => {
      subscription.unsubscribe()
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', online)
        window.removeEventListener('storage', changed)
      }
    }
  }
  return { client, config, getSnapshot: () => state, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    start, join, offerSolve, stop, retry, removeResults }
}
export type LeaderboardStore = ReturnType<typeof createLeaderboardStore>
