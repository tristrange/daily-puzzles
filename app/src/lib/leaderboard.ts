import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { isPuzzleId } from '../domain/dates'

export type LeaderboardConfig = { readonly url: string; readonly publishableKey: string; readonly siteKey: string }
export type LeaderboardEntry = { readonly rank: number; readonly nickname: string; readonly elapsed_ms: number; readonly hints: number; readonly is_you: boolean }
export type LeaderboardSnapshot = { readonly entries: readonly LeaderboardEntry[]; readonly total: number; readonly own_entry: LeaderboardEntry | null }
export type LeaderboardResult = { readonly id: string; readonly nickname: string; readonly elapsedMs: number; readonly hints: number }

export function parseLeaderboardConfig(values: Record<string, unknown>): LeaderboardConfig | null {
  const url = values['VITE_SUPABASE_URL'], publishableKey = values['VITE_SUPABASE_PUBLISHABLE_KEY'], siteKey = values['VITE_TURNSTILE_SITE_KEY']
  if (typeof url !== 'string' || !/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url)
    || typeof publishableKey !== 'string' || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey)
    || typeof siteKey !== 'string' || !/^0x[A-Za-z0-9_-]+$/.test(siteKey)) return null
  return { url: url.replace(/\/$/, ''), publishableKey, siteKey }
}

export function leaderboardSessionKey(url: string): string {
  return `daily-puzzles:leaderboard:auth:${new URL(url).hostname}`
}

export function createLeaderboardClient(config: LeaderboardConfig): SupabaseClient {
  return createClient(config.url, config.publishableKey, {
    auth: { detectSessionInUrl: false, storageKey: leaderboardSessionKey(config.url) },
    global: { fetch: (input, init) => fetch(input, { ...init,
      signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000) }) },
  })
}

export function isScoreNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}
export function isLeaderboardNickname(value: unknown): value is string {
  return typeof value === 'string' && value === value.trim() && /^[-A-Za-z0-9_ ]{2,20}$/.test(value)
}
function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null
}
function entry(value: unknown, total: number): value is LeaderboardEntry {
  const row = object(value)
  return row !== null && isScoreNumber(row['rank']) && row['rank'] >= 1 && row['rank'] <= total
    && isLeaderboardNickname(row['nickname']) && isScoreNumber(row['elapsed_ms']) && isScoreNumber(row['hints']) && typeof row['is_you'] === 'boolean'
}
const unavailable = () => new Error('Leaderboard unavailable. Please try again.')

export async function readLeaderboard(client: SupabaseClient, puzzleId: string): Promise<LeaderboardSnapshot> {
  if (!isPuzzleId(puzzleId)) throw unavailable()
  const { data, error } = await client.rpc('get_leaderboard', { p_puzzle_id: puzzleId }).abortSignal(AbortSignal.timeout(15_000))
  if (error) throw error.code === '22023' ? new Error('This leaderboard is not available yet.') : unavailable()
  const board = object(data)
  if (!board || !isScoreNumber(board['total']) || !Array.isArray(board['entries']) || board['entries'].length > 25
    || board['entries'].length > board['total'] || !board['entries'].every(row => entry(row, board['total'] as number))
    || (board['own_entry'] !== null && (!entry(board['own_entry'], board['total']) || !board['own_entry'].is_you))) throw unavailable()
  return { entries: board['entries'] as LeaderboardEntry[], total: board['total'], own_entry: board['own_entry'] as LeaderboardEntry | null }
}

export async function submitLeaderboardResult(client: SupabaseClient, result: LeaderboardResult): Promise<'created' | 'existing'> {
  if (!isPuzzleId(result.id) || !isLeaderboardNickname(result.nickname) || !isScoreNumber(result.elapsedMs) || !isScoreNumber(result.hints)) throw unavailable()
  const { data, error } = await client.rpc('submit_result', { p_puzzle_id: result.id, p_nickname: result.nickname,
    p_elapsed_ms: result.elapsedMs, p_hints: result.hints }).abortSignal(AbortSignal.timeout(15_000))
  const status = object(data)?.['status']
  if (error || (status !== 'created' && status !== 'existing')) throw unavailable()
  return status
}

export async function removeLeaderboardResults(client: SupabaseClient): Promise<number> {
  const { data, error } = await client.rpc('remove_my_results').abortSignal(AbortSignal.timeout(15_000))
  if (error || !isScoreNumber(data)) throw unavailable()
  return data
}
