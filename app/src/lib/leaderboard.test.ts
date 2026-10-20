import { afterEach, expect, it, vi } from 'vitest'
import { createLeaderboardClient, parseLeaderboardConfig, readLeaderboard, removeLeaderboardResults, submitLeaderboardResult } from './leaderboard'

const values = { VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example', VITE_TURNSTILE_SITE_KEY: '0x4example' }
const config = { url: 'https://example.supabase.co', publishableKey: 'sb_publishable_example', siteKey: '0x4example' }
const alice = { rank: 1, nickname: 'Alice', elapsed_ms: 60000, hints: 0, is_you: false }
const bob = { ...alice, nickname: 'Bob', is_you: true }
const carol = { rank: 3, nickname: 'Carol', elapsed_ms: 1000, hints: 1, is_you: false }
function respond(data: unknown, status = 200) {
  const requests: { url: string; body: unknown; authorization: string | null }[] = []
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    requests.push({ url: String(url), body: JSON.parse(String(init.body)), authorization: new Headers(init.headers).get('Authorization') })
    return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
  })
  return requests
}
function authorizedClient() {
  const client = createLeaderboardClient(config)
  vi.spyOn(client.auth, 'getSession').mockResolvedValue({ data: { session: {
    access_token: 'owner-token', refresh_token: 'test', token_type: 'bearer', expires_in: 3600,
    user: { id: 'player-a', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '' },
  } }, error: null })
  return client
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('requires complete public-only configuration before a client can be created', () => {
  expect(parseLeaderboardConfig(values)).toEqual(config)
  for (const invalid of [{}, { ...values, VITE_TURNSTILE_SITE_KEY: '' }, { ...values, VITE_SUPABASE_URL: 'https://example.org' },
    { ...values, VITE_SUPABASE_URL: 'https://example.supabase.co/path' }, { ...values, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_private' }]) {
    expect(parseLeaderboardConfig(invalid)).toBeNull()
  }
})

it('reads tied ranks and caller fields through the public RPC without creating an identity', async () => {
  const requests = respond({ entries: [alice, bob, carol], total: 3, own_entry: null })
  const snapshot = await readLeaderboard(createLeaderboardClient(config), '2026-10-19')
  expect(snapshot).toEqual({ entries: [alice, bob, carol], total: 3, own_entry: null })
  expect(requests.map(({ url, body }) => ({ url, body }))).toEqual([{ url: 'https://example.supabase.co/rest/v1/rpc/get_leaderboard', body: { p_puzzle_id: '2026-10-19' } }])
})

it('retains a caller outside the first 25, including a tied rank of one', async () => {
  const entries = Array.from({ length: 25 }, () => alice)
  const own = { ...alice, nickname: 'Outside', is_you: true }
  respond({ entries, total: 26, own_entry: own })
  expect((await readLeaderboard(createLeaderboardClient(config), '2026-10-19-tracks-large')).own_entry).toEqual(own)
})

it('rejects malformed rankings instead of displaying untrusted fields', async () => {
  for (const data of [{ entries: [alice], total: -1, own_entry: null },
    { entries: [{ ...alice, rank: 0 }], total: 1, own_entry: null },
    { entries: [{ ...alice, nickname: '<script>' }], total: 1, own_entry: null },
    { entries: [{ ...alice, hints: 0.5 }], total: 1, own_entry: null },
    { entries: [{ ...alice, elapsed_ms: 9007199254740992 }], total: 1, own_entry: null },
    { entries: Array(26).fill(alice), total: 26, own_entry: null },
    { entries: [], total: 1, own_entry: alice }]) {
    respond(data)
    await expect(readLeaderboard(createLeaderboardClient(config), '2026-10-19')).rejects.toThrow()
  }
})

it('sends exact first-score payloads and accepts only backend acknowledgments', async () => {
  const requests = respond({ status: 'created' })
  expect(await submitLeaderboardResult(authorizedClient(), { id: '2026-10-19', nickname: 'Alice', elapsedMs: 60000, hints: 2 }, 'player-a')).toBe('created')
  expect(requests[0]?.body).toEqual({ p_puzzle_id: '2026-10-19', p_nickname: 'Alice', p_elapsed_ms: 60000, p_hints: 2 })
  respond({ status: 'existing' })
  expect(await submitLeaderboardResult(authorizedClient(), { id: '2026-10-19', nickname: 'Alice', elapsedMs: 60000, hints: 2 }, 'player-a')).toBe('existing')
  respond({ status: 'changed' })
  await expect(submitLeaderboardResult(authorizedClient(), { id: '2026-10-19', nickname: 'Alice', elapsedMs: 1, hints: 0 }, 'player-a')).rejects.toThrow()
})

it('rejects invalid writes locally and exposes controlled request/deletion failures', async () => {
  const requests = respond(3)
  const client = authorizedClient()
  await expect(submitLeaderboardResult(client, { id: 'preview-trio', nickname: 'Alice', elapsedMs: 1, hints: 0 }, 'player-a')).rejects.toThrow()
  await expect(submitLeaderboardResult(client, { id: '2026-10-19', nickname: 'Alice', elapsedMs: 1, hints: -1 }, 'player-a')).rejects.toThrow()
  expect(requests).toHaveLength(0)
  expect(await removeLeaderboardResults(client, 'player-a')).toBe(3)
  respond('3')
  await expect(removeLeaderboardResults(client, 'player-a')).rejects.toThrow()
  respond({ code: '22023', message: 'private provider detail' }, 400)
  await expect(readLeaderboard(client, '2026-10-19')).rejects.toThrow('not available')
})

it('never submits or deletes an old identity’s results through a changed SDK session', async () => {
  const requests = respond({ status: 'created' })
  const client = createLeaderboardClient(config)
  vi.spyOn(client.auth, 'getSession').mockResolvedValue({ data: { session: {
    access_token: 'new-player-token', refresh_token: 'test', token_type: 'bearer', expires_in: 3600,
    user: { id: 'new-player', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '' },
  } }, error: null })
  await expect(submitLeaderboardResult(client, { id: '2026-10-19', nickname: 'Alice', elapsedMs: 1, hints: 0 }, 'old-player')).rejects.toThrow()
  await expect(removeLeaderboardResults(client, 'old-player')).rejects.toThrow()
  expect(requests).toHaveLength(0)
})

it('keeps the checked owner token on the request if Auth changes before fetch', async () => {
  const requests = respond({ status: 'created' }), client = authorizedClient()
  const next = { access_token: 'different-player-token', refresh_token: 'test', token_type: 'bearer' as const, expires_in: 3600,
    user: { id: 'player-b', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '' } }
  vi.mocked(client.auth.getSession).mockResolvedValueOnce({ data: { session: { ...next, access_token: 'owner-token', user: { ...next.user, id: 'player-a' } } }, error: null })
    .mockResolvedValue({ data: { session: next }, error: null })
  await submitLeaderboardResult(client, { id: '2026-10-19', nickname: 'Alice', elapsedMs: 1, hints: 0 }, 'player-a')
  expect(requests[0]?.authorization).toBe('Bearer owner-token')
})

it('uses the supplied durable storage after startup storage failure recovers', async () => {
  const values = new Map<string, string>()
  let blocked = true
  const storage = { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { if (blocked) throw Error('temporarily blocked'); values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) } }
  const client = createLeaderboardClient(config, storage)
  await client.auth.getSession()
  blocked = false
  const user = { id: 'persistent-player', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '', is_anonymous: true }
  const token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.signature`
  vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ access_token: token, refresh_token: 'refresh', token_type: 'bearer', expires_in: 3600, user }), { headers: { 'content-type': 'application/json' } }))
  const signed = await client.auth.signInAnonymously({ options: { captchaToken: 'verified' } })
  expect(signed.error).toBeNull()
  expect(JSON.parse(values.get('daily-puzzles:leaderboard:auth:example.supabase.co') ?? 'null')?.user.id).toBe('persistent-player')
  await client.auth.stopAutoRefresh()
})
