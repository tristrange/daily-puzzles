import { afterEach, expect, it, vi } from 'vitest'
import { createLeaderboardClient, parseLeaderboardConfig, readLeaderboard, removeLeaderboardResults, submitLeaderboardResult } from './leaderboard'

const values = { VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_example', VITE_TURNSTILE_SITE_KEY: '0x4example' }
const config = { url: 'https://example.supabase.co', publishableKey: 'sb_publishable_example', siteKey: '0x4example' }
const alice = { rank: 1, nickname: 'Alice', elapsed_ms: 60000, hints: 0, is_you: false }
const bob = { ...alice, nickname: 'Bob', is_you: true }
const carol = { rank: 3, nickname: 'Carol', elapsed_ms: 1000, hints: 1, is_you: false }
function respond(data: unknown, status = 200) {
  const requests: { url: string; body: unknown }[] = []
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    requests.push({ url: String(url), body: JSON.parse(String(init.body)) })
    return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } })
  })
  return requests
}
afterEach(() => vi.unstubAllGlobals())

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
  expect(requests).toEqual([{ url: 'https://example.supabase.co/rest/v1/rpc/get_leaderboard', body: { p_puzzle_id: '2026-10-19' } }])
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
  expect(await submitLeaderboardResult(createLeaderboardClient(config), { id: '2026-10-19', nickname: 'Alice', elapsedMs: 60000, hints: 2 })).toBe('created')
  expect(requests[0]?.body).toEqual({ p_puzzle_id: '2026-10-19', p_nickname: 'Alice', p_elapsed_ms: 60000, p_hints: 2 })
  respond({ status: 'existing' })
  expect(await submitLeaderboardResult(createLeaderboardClient(config), { id: '2026-10-19', nickname: 'Alice', elapsedMs: 60000, hints: 2 })).toBe('existing')
  respond({ status: 'changed' })
  await expect(submitLeaderboardResult(createLeaderboardClient(config), { id: '2026-10-19', nickname: 'Alice', elapsedMs: 1, hints: 0 })).rejects.toThrow()
})

it('rejects invalid writes locally and exposes controlled request/deletion failures', async () => {
  const requests = respond(3)
  const client = createLeaderboardClient(config)
  await expect(submitLeaderboardResult(client, { id: 'preview-trio', nickname: 'Alice', elapsedMs: 1, hints: 0 })).rejects.toThrow()
  await expect(submitLeaderboardResult(client, { id: '2026-10-19', nickname: 'Alice', elapsedMs: 1, hints: -1 })).rejects.toThrow()
  expect(requests).toHaveLength(0)
  expect(await removeLeaderboardResults(client)).toBe(3)
  respond('3')
  await expect(removeLeaderboardResults(client)).rejects.toThrow()
  respond({ code: '22023', message: 'private provider detail' }, 400)
  await expect(readLeaderboard(client, '2026-10-19')).rejects.toThrow('not available')
})
