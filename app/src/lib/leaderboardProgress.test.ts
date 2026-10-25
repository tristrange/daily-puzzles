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
  const tails = new Map<string, Promise<unknown>>()
  vi.stubGlobal('navigator', { locks: { request: (key: string, work: () => unknown) => {
    const next = (tails.get(key) ?? Promise.resolve()).then(work)
    tails.set(key, next.catch(() => {}))
    return next
  } } })
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
  await store.offerSolve(solve)
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
  await store.offerSolve(solve); await store.retry()
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
  await store.offerSolve(solve)
  await new Promise(resolve => setTimeout(resolve, 0))
  const stopping = store.stop()
  release(new Response('{}', { status: 503 }))
  await stopping
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
    await store.offerSolve({ ...solve, id: date })
  }
  await store.offerSolve({ ...solve, id: '2026-05-01' })
  expect(store.getSnapshot()).toMatchObject({ pendingCount: 100 })
  expect(store.getSnapshot().message).toContain('not queued')
  const saved = f.storage.getItem(leaderboardProgressKey(config.url))!
  expect(saved).toContain('2026-01-01')
  expect(saved).not.toContain('2026-05-01')
  await store.stop(); await store.retry()
  expect(store.getSnapshot().pendingCount).toBe(0)
})

it('never reassigns pending uploads after identity loss or another project', async () => {
  const f = fixture(), store = createLeaderboardStore(config, f.client, f.storage)
  await store.join('Alice', 'captcha')
  f.setResponse(async () => new Response('{}', { status: 503 }))
  await store.offerSolve(solve); await store.retry()
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
  await store.offerSolve(solve)
  await new Promise(resolve => setTimeout(resolve, 0))
  const offered = store.offerSolve({ ...solve, id: '2026-10-18' })
  const remove = store.removeResults()
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(f.requests).toHaveLength(1)
  f.setResponse(async () => new Response('1'))
  release(new Response('{"status":"created"}'))
  await remove
  await offered
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
  await store.offerSolve(solve); await store.retry()
  expect(f.requests).toHaveLength(0)
  expect(store.getSnapshot().status).toBe('off')
  close()
  const blocked = createLeaderboardStore(config, f.client, { getItem: () => null, setItem: () => { throw Error('blocked') }, removeItem: () => {} })
  await expect(blocked.join('Alice', 'captcha')).rejects.toThrow('storage')
  expect(blocked.getSnapshot().status).not.toBe('on')
  f.storage.setItem(leaderboardProgressKey(config.url), '{broken')
  expect(createLeaderboardStore(config, f.client, f.storage).getSnapshot().pendingCount).toBe(0)
  const disabled = createLeaderboardStore(null, null, f.storage)
  await disabled.offerSolve(solve); await disabled.retry()
  expect(disabled.getSnapshot().status).toBe('disabled')
})

it('serializes an enqueue with another tab stopping instead of restoring stale participation', async () => {
  const f = fixture()
  const other = createLeaderboardStore(config, f.client, f.storage)
  await other.join('Alice', 'captcha')
  let armed = false, stopping: Promise<void> = Promise.resolve()
  const storage = { ...f.storage, getItem: (key: string) => {
    const value = f.storage.getItem(key)
    if (armed && key === leaderboardProgressKey(config.url)) { armed = false; stopping = other.stop() }
    return value
  } }
  const store = createLeaderboardStore(config, f.client, storage)
  await store.retry()
  armed = true
  await store.offerSolve(solve)
  await stopping
  await store.retry()
  expect(JSON.parse(f.storage.getItem(leaderboardProgressKey(config.url))!).enabled).toBe(false)
  expect(f.requests).toHaveLength(0)
})

it('waits for another tab’s in-flight submission before removing the owner’s results', async () => {
  const f = fixture(), sender = createLeaderboardStore(config, f.client, f.storage)
  await sender.join('Alice', 'captcha')
  const remover = createLeaderboardStore(config, f.client, f.storage)
  await remover.retry()
  let release!: (response: Response) => void
  f.setResponse(() => new Promise(resolve => { release = resolve }))
  await sender.offerSolve(solve)
  await new Promise(resolve => setTimeout(resolve, 0))
  f.setResponse(async () => new Response('1'))
  const removing = remover.removeResults()
  await new Promise(resolve => setTimeout(resolve, 0))
  const beforeRelease = f.requests.map(request => request.name)
  release(new Response('{"status":"created"}'))
  await removing
  expect(beforeRelease).toEqual(['submit_result'])
  expect(f.requests.map(request => request.name)).toEqual(['submit_result', 'remove_my_results'])
  expect(remover.getSnapshot().pendingCount).toBe(0)
})

it('retains a first solve under its persisted owner while the initial session is restoring', async () => {
  const f = fixture(), original = createLeaderboardStore(config, f.client, f.storage)
  await original.join('Alice', 'captcha')
  const restored = await f.client.auth.getSession()
  let release!: (value: typeof restored) => void
  vi.mocked(f.client.auth.getSession).mockImplementationOnce(() => new Promise(resolve => { release = resolve }))
  const store = createLeaderboardStore(config, f.client, f.storage), restoring = store.retry()
  await store.offerSolve(solve)
  const pendingBeforeRestoration = store.getSnapshot().pendingCount
  release(restored)
  await restoring
  expect(pendingBeforeRestoration).toBe(1)
  expect(f.requests).toHaveLength(1)
  expect(store.getSnapshot()).toMatchObject({ status: 'on', pendingCount: 0 })
})

it('drains the new owner’s candidate after the old owner’s in-flight drain settles', async () => {
  const f = fixture(), store = createLeaderboardStore(config, f.client, f.storage)
  await store.join('Alice', 'captcha')
  let release!: (response: Response) => void
  f.setResponse(() => new Promise(resolve => { release = resolve }))
  await store.offerSolve(solve)
  await new Promise(resolve => setTimeout(resolve, 0))
  f.switchIdentity()
  f.setResponse(async () => new Response('{"status":"created"}'))
  const joining = store.join('Bob', 'captcha', { ...solve, id: '2026-10-18' })
  await new Promise(resolve => setTimeout(resolve, 0))
  release(new Response('{"status":"created"}'))
  await joining
  expect(f.requests.map(request => (request.body as { p_nickname: string }).p_nickname)).toEqual(['Alice', 'Bob'])
  expect(store.getSnapshot()).toMatchObject({ status: 'on', pendingCount: 0, nickname: 'Bob' })
})

it('uses newly enabled participation before a delayed cross-tab storage event arrives', async () => {
  const f = fixture(), staleTab = createLeaderboardStore(config, f.client, f.storage)
  await staleTab.retry()
  expect(staleTab.getSnapshot().status).toBe('off')
  const joiningTab = createLeaderboardStore(config, f.client, f.storage)
  await joiningTab.join('Alice', 'captcha')
  // The SDK can read the new shared session before this tab receives storage events.
  await staleTab.offerSolve(solve)
  await staleTab.retry()
  expect(f.requests).toEqual([{ name: 'submit_result', body: { p_puzzle_id: solve.id, p_nickname: 'Alice', p_elapsed_ms: solve.elapsedMs, p_hints: solve.hints } }])
  expect(staleTab.getSnapshot()).toMatchObject({ status: 'on', pendingCount: 0 })
  expect(f.signup).toHaveBeenCalledTimes(1)
})

it('queues a solve when another tab re-enables publishing before the enable event arrives', async () => {
  const f = fixture(), events = new EventTarget()
  vi.stubGlobal('window', events)
  const key = leaderboardProgressKey(config.url)
  const other = createLeaderboardStore(config, f.client, f.storage)
  await other.join('Alice', 'captcha')

  const staleTab = createLeaderboardStore(config, f.client, f.storage)
  const close = staleTab.start()
  await staleTab.retry()
  await other.stop()
  events.dispatchEvent(Object.assign(new Event('storage'), { key }))
  expect(staleTab.getSnapshot().status).toBe('off')

  await other.join('Alice', 'captcha')
  await staleTab.offerSolve(solve)
  // The enable event arrived after the solve; the queued result must still publish.
  events.dispatchEvent(Object.assign(new Event('storage'), { key }))
  await staleTab.retry()
  expect(f.requests).toEqual([{ name: 'submit_result', body: { p_puzzle_id: solve.id, p_nickname: 'Alice', p_elapsed_ms: solve.elapsedMs, p_hints: solve.hints } }])
  expect(staleTab.getSnapshot()).toMatchObject({ status: 'on', pendingCount: 0 })
  close()
})

it('reloads participation on remount after missing a cross-tab stop', async () => {
  const f = fixture(), events = new EventTarget()
  vi.stubGlobal('window', events)
  const key = leaderboardProgressKey(config.url)
  const staleTab = createLeaderboardStore(config, f.client, f.storage)
  const close = staleTab.start()
  await staleTab.join('Alice', 'captcha')

  const other = createLeaderboardStore(config, f.client, f.storage)
  await other.stop()
  events.dispatchEvent(Object.assign(new Event('storage'), { key }))
  expect(staleTab.getSnapshot().status).toBe('off')
  close()

  // The gate is unmounted, so this tab misses the other tab re-enabling
  // publishing and queuing a result. Remounting must not trust the old stop.
  await other.join('Alice', 'captcha')
  f.setResponse(async () => new Response('{}', { status: 503 }))
  await other.offerSolve(solve)
  await other.retry()
  expect(JSON.parse(f.storage.getItem(key)!).pending).toHaveLength(1)
  const before = f.requests.length

  f.setResponse(async () => new Response(JSON.stringify({ status: 'created' })))
  const reopen = staleTab.start()
  await staleTab.retry()
  expect(f.requests.length - before).toBe(1)
  expect(staleTab.getSnapshot()).toMatchObject({ status: 'on', pendingCount: 0 })
  reopen()
})

it('does not report a failed session read as storage failure while queuing', async () => {
  const f = fixture(), store = createLeaderboardStore(config, f.client, f.storage)
  await store.join('Alice', 'captcha')
  const other = createLeaderboardStore(config, f.client, f.storage)
  f.switchIdentity()
  await other.join('Bob', 'captcha')
  vi.mocked(f.client.auth.getSession).mockRejectedValueOnce(Error('network'))
  await store.offerSolve(solve)
  await store.retry()
  expect(store.getSnapshot().status).toBe('on')
  expect(store.getSnapshot().message).toContain('session')
  expect(store.getSnapshot().message).not.toContain('storage')
})

it('preserves the solve snapshot through opt-in, offline queue, reload and retry', async () => {
  const f = fixture(), store = createLeaderboardStore(config, f.client, f.storage)
  f.setResponse(async () => new Response('{}', { status: 503 }))
  const record = { ...solve, attemptElapsedMs: 1500 }
  await store.join('Alice', 'captcha', record)
  expect(store.getSnapshot().pendingCount).toBe(1)
  const pending = JSON.parse(f.storage.getItem(leaderboardProgressKey(config.url))!).pending
  expect(pending).toEqual([{ id: solve.id, nickname: 'Alice', elapsedMs: 60000, attemptElapsedMs: 1500, hints: 2 }])
  const reopened = createLeaderboardStore(config, f.client, f.storage)
  f.setResponse(async () => new Response(JSON.stringify({ status: 'created' })))
  await reopened.retry()
  expect(reopened.getSnapshot().pendingCount).toBe(0)
  expect(f.requests.length).toBeGreaterThan(1)
  for (const request of f.requests) expect(request.body).toEqual({ p_puzzle_id: solve.id, p_nickname: 'Alice', p_elapsed_ms: 60000, p_attempt_elapsed_ms: 1500, p_hints: 2 })
})

it('drops malformed pending attempt decoration while preserving its legacy score', async () => {
  const f = fixture(), store = createLeaderboardStore(config, f.client, f.storage)
  await store.join('Alice', 'captcha')
  const key = leaderboardProgressKey(config.url), saved = JSON.parse(f.storage.getItem(key)!)
  f.storage.setItem(key, JSON.stringify({ ...saved, pending: [{ id: solve.id, nickname: 'Alice', elapsedMs: 60000, hints: 2, attemptElapsedMs: 60001 }] }))
  const reopened = createLeaderboardStore(config, f.client, f.storage)
  await reopened.retry()
  expect(f.requests[0]?.body).toEqual({ p_puzzle_id: solve.id, p_nickname: 'Alice', p_elapsed_ms: 60000, p_hints: 2 })
})
