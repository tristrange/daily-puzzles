import { afterEach, expect, it, vi } from 'vitest'
import type { Session } from '@supabase/supabase-js'
import { createLeaderboardClient } from './leaderboard'
import { createLeaderboardStore, leaderboardProgressKey } from './leaderboardProgress'

const config = { url: 'https://example.supabase.co', publishableKey: 'sb_publishable_example', siteKey: '0x4example' }
const solve = { id: '2026-10-19', puzzleType: 'queens' as const, size: 7, elapsedMs: 60000, hints: 2, solvedAt: 1000 }
function memory() {
  const values = new Map<string, string>()
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } }
}
function fixture() {
  const storage = memory()
  let session: Session | null = null
  const identity = (id = 'player-a'): Session => ({ access_token: 'test', refresh_token: 'test', token_type: 'bearer', expires_in: 3600,
    user: { id, aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '', is_anonymous: true } })
  const client = createLeaderboardClient(config)
  vi.spyOn(client.auth, 'getSession').mockImplementation(async () => session ? { data: { session }, error: null } : { data: { session: null }, error: null })
  const signup = vi.spyOn(client.auth, 'signInAnonymously').mockImplementation(async () => {
    session = identity()
    return { data: { user: session.user, session }, error: null }
  })
  vi.spyOn(client.auth, 'onAuthStateChange').mockReturnValue({ data: { subscription: { id: 'test', callback: () => {}, unsubscribe: () => {} } } })
  const requests: { name: string; body: unknown }[] = []
  let response: () => Promise<Response> = async () => new Response(JSON.stringify({ status: 'created' }))
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    requests.push({ name: String(url).split('/').at(-1)!, body: init.body ? JSON.parse(String(init.body)) : null })
    return response()
  })
  return { client, storage, signup, requests, setResponse: (next: () => Promise<Response>) => { response = next },
    lose: () => { session = null }, switchIdentity: () => { session = identity('player-b') } }
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('does not create an identity or upload history while browsing, and requires explicit joining', async () => {
  const f = fixture(), store = createLeaderboardStore(config, f.client, f.storage)
  const close = store.start(); await store.retry()
  store.offerSolve(solve)
  expect(store.getSnapshot().status).toBe('off')
  expect(f.signup).not.toHaveBeenCalled()
  expect(f.requests).toHaveLength(0)
  await expect(store.join('Alice', '')).rejects.toThrow()
  await expect(store.join('<script>', 'captcha')).rejects.toThrow()
  await store.join(' Alice ', 'captcha', solve)
  expect(store.getSnapshot()).toMatchObject({ status: 'on', nickname: 'Alice', pendingCount: 0 })
  expect(f.requests).toEqual([{ name: 'submit_result', body: { p_puzzle_id: '2026-10-19', p_nickname: 'Alice', p_elapsed_ms: 60000, p_hints: 2 } }])
  close()
})

it('persists identical failed payloads and serializes retry triggers', async () => {
  const f = fixture(), store = createLeaderboardStore(config, f.client, f.storage)
  await store.join('Alice', 'captcha')
  f.setResponse(async () => new Response(JSON.stringify({ message: 'Unavailable' }), { status: 503 }))
  store.offerSolve(solve); await store.retry()
  expect(store.getSnapshot().pendingCount).toBe(1)
  let release!: (value: Response) => void
  f.setResponse(() => new Promise(resolve => { release = resolve }))
  const before = f.requests.length
  const reopened = createLeaderboardStore(config, f.client, f.storage)
  const first = reopened.retry(), second = reopened.retry()
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(f.requests.length - before).toBe(1)
  release(new Response(JSON.stringify({ status: 'existing' })))
  await Promise.all([first, second])
  expect(reopened.getSnapshot().pendingCount).toBe(0)
  expect(f.requests.every(request => JSON.stringify(request.body) === JSON.stringify({ p_puzzle_id: '2026-10-19', p_nickname: 'Alice', p_elapsed_ms: 60000, p_hints: 2 }))).toBe(true)
})

it('a failed in-flight request cannot change stopped publication back to pending', async () => {
  const f = fixture(), store = createLeaderboardStore(config, f.client, f.storage)
  await store.join('Alice', 'captcha')
  let release!: (response: Response) => void
  f.setResponse(() => new Promise(resolve => { release = resolve }))
  store.offerSolve(solve)
  await new Promise(resolve => setTimeout(resolve, 0))
  store.stop()
  release(new Response('{}', { status: 503 }))
  await store.retry()
  expect(store.getSnapshot()).toMatchObject({ status: 'off', pendingCount: 0 })
  expect(store.getSnapshot().message).toContain('stopped')
})

it('repeated mounts cannot create users, and failed joining leaves publication disabled', async () => {
  const f = fixture(), store = createLeaderboardStore(config, f.client, f.storage)
  store.start()(); const close = store.start(); await store.retry()
  expect(f.signup).not.toHaveBeenCalled()
  f.signup.mockRejectedValueOnce(Error('network'))
  await expect(store.join('Alice', 'captcha')).rejects.toThrow()
  expect(store.getSnapshot().status).toBe('off')
  await store.retry()
  expect(f.signup).toHaveBeenCalledTimes(1)
  close()
})

it('retains the original 100 queued results and reports a new overflow without eviction', async () => {
  const f = fixture(), store = createLeaderboardStore(config, f.client, f.storage)
  await store.join('Alice', 'captcha')
  f.setResponse(async () => new Response('{}', { status: 503 }))
  for (let day = 1; day <= 100; day++) {
    const date = new Date(Date.UTC(2026, 0, day)).toISOString().slice(0, 10)
    store.offerSolve({ ...solve, id: date })
  }
  store.offerSolve({ ...solve, id: '2026-05-01' })
  expect(store.getSnapshot()).toMatchObject({ pendingCount: 100 })
  expect(store.getSnapshot().message).toContain('not queued')
  const saved = f.storage.getItem(leaderboardProgressKey(config.url))!
  expect(saved).toContain('2026-01-01')
  expect(saved).not.toContain('2026-05-01')
  store.stop(); await store.retry()
  expect(store.getSnapshot().pendingCount).toBe(0)
})

it('never reassigns pending uploads after identity loss or another project', async () => {
  const f = fixture(), store = createLeaderboardStore(config, f.client, f.storage)
  await store.join('Alice', 'captcha')
  f.setResponse(async () => new Response('{}', { status: 503 }))
  store.offerSolve(solve); await store.retry()
  f.lose(); const before = f.requests.length
  await store.retry()
  expect(store.getSnapshot().status).toBe('lost')
  expect(f.requests).toHaveLength(before)
  f.switchIdentity(); await store.retry()
  expect(store.getSnapshot().status).toBe('lost')
  expect(f.requests).toHaveLength(before)
  const other = createLeaderboardStore({ ...config, url: 'https://other.supabase.co' }, f.client, f.storage)
  await other.retry()
  expect(other.getSnapshot().pendingCount).toBe(0)
  expect(other.getSnapshot().status).toBe('off')
})

it('stop and deletion cannot resurrect queued results after an in-flight submission', async () => {
  const f = fixture(), store = createLeaderboardStore(config, f.client, f.storage)
  await store.join('Alice', 'captcha')
  let release!: (response: Response) => void
  f.setResponse(() => new Promise(resolve => { release = resolve }))
  store.offerSolve(solve)
  await new Promise(resolve => setTimeout(resolve, 0))
  store.offerSolve({ ...solve, id: '2026-10-18' })
  const remove = store.removeResults()
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(f.requests).toHaveLength(1)
  f.setResponse(async () => new Response('1'))
  release(new Response('{"status":"created"}'))
  await remove
  expect(f.requests.map(request => request.name)).toEqual(['submit_result', 'remove_my_results'])
  expect(store.getSnapshot()).toMatchObject({ status: 'off', pendingCount: 0 })
  expect(f.storage.getItem(leaderboardProgressKey(config.url))).not.toContain('2026-10-18')
})

it('honors cross-tab stop and refuses blocked/corrupt storage without creating users', async () => {
  const f = fixture(), events = new EventTarget()
  vi.stubGlobal('window', events)
  const store = createLeaderboardStore(config, f.client, f.storage)
  const close = store.start(); await store.join('Alice', 'captcha')
  f.storage.removeItem(leaderboardProgressKey(config.url))
  events.dispatchEvent(Object.assign(new Event('storage'), { key: leaderboardProgressKey(config.url) }))
  store.offerSolve(solve); await store.retry()
  expect(f.requests).toHaveLength(0)
  expect(store.getSnapshot().status).toBe('off')
  close()
  const blocked = createLeaderboardStore(config, f.client, { getItem: () => null, setItem: () => { throw Error('blocked') }, removeItem: () => {} })
  await expect(blocked.join('Alice', 'captcha')).rejects.toThrow('storage')
  expect(blocked.getSnapshot().status).not.toBe('on')
  f.storage.setItem(leaderboardProgressKey(config.url), '{broken')
  expect(createLeaderboardStore(config, f.client, f.storage).getSnapshot().pendingCount).toBe(0)
  const disabled = createLeaderboardStore(null, null, f.storage)
  disabled.offerSolve(solve); await disabled.retry()
  expect(disabled.getSnapshot().status).toBe('disabled')
})
