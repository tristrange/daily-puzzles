# Leaderboard App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan inline, preserving the user's chosen execution method. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional anonymous participation, per-puzzle rankings and first-solve publishing without interrupting local play.

**Architecture:** Use the official Supabase JavaScript SDK for identity/session renewal and the existing restricted RPCs for results. One React provider owns participation and the identity-scoped pending queue; the page and solved panel reuse one ranked-results component. Keep all existing puzzle clocks, local Stats and completion rules.

**Tech Stack:** React, TypeScript, existing Vitest, `@supabase/supabase-js`, free managed Turnstile and the merged PostgreSQL backend.

**Spec:** `docs/superpowers/specs/2026-10-19-anonymous-leaderboards-design.md`.

## Global Constraints

- Operating cost must remain $0; no new hosted service, paid option or keep-alive.
- Public browsing creates no anonymous identity; Turnstile loads only during joining.
- Use SDK session persistence/renewal, never custom token handling or a browser administrative key.
- Keep `storeSolve` synchronous; publish fresh first daily/archive solves only, never previews, replays or bulk history.
- Preserve game-specific elapsed-time and hint semantics. Rank only the exact puzzle ID.
- Scope pending entries to project and identity, retain identical retry payloads, cap at 100 without silent eviction.
- Retry on app opening, return online and explicit Retry; no polling or overlapping queue sends.
- Stop cancels pending publication; removing published results requires confirmation and leaves local Stats untouched.
- Missing/invalid configuration and backend/storage failures preserve local gameplay.
- Public activation requires the real two-session Auth/CAPTCHA check; SQL tests alone are insufficient.

## Review Focus

- StrictMode, fast navigation and simultaneous retry triggers must not duplicate identity creation or overlap queue sends; Task 2 tests this.
- A lost session, changed project or another tab stopping participation must not send old queued results as a new player; Task 2 tests this.
- Finishing while offline, stopping participation during an in-flight request and exhausting the queue must retain honest publication status; Tasks 2–3 test this.
- Replays, resumed boards and preview completion must not republish old local Stats or change time/hints; Task 3 extends stage handler tests.
- Late responses for a previously selected puzzle and malformed API fields must not display misleading rankings; Tasks 1 and 3 test this.

## File map

- `app/src/lib/leaderboard.ts` / `.test.ts`: public configuration, SDK creation, typed RPC calls and response validation.
- `app/src/lib/leaderboardProgress.ts` / `.test.ts`: validated local participation/queue storage, project/identity boundaries and pure queue operations.
- `app/src/components/LeaderboardProvider.tsx` / `.test.tsx`: session lifecycle, queue serialization, cross-tab/online handling and shared React actions/status.
- `app/src/lib/useLeaderboard.ts`: shared context/hook, separated from the component for Fast Refresh.
- `app/src/components/JoinLeaderboard.tsx`: nickname/consent form and managed widget lifecycle.
- `app/src/components/LeaderboardPanel.tsx` / `.test.tsx`: reusable rankings, publication status and participation controls.
- `app/src/pages/LeaderboardsPage.tsx` / `.test.tsx`: exact puzzle selection using existing game/date/Track size helpers.
- `app/src/components/SolvedPanel.tsx`, `PuzzleView.tsx`, `TracksStage.tsx`, `WordPathsStage.tsx`, `TrioStage.tsx` and relevant existing tests: fresh completion handoff.
- `app/src/App.tsx`, `components/Shell.tsx`, `App.css`: provider, route, fifth navigation item and responsive presentation.
- `.github/workflows/ci.yml`, `README.md`, `docs/leaderboard-setup.md`, `docs/journal.md`, existing privacy copy: browser build configuration and accurate setup/disclosure.

### Task 1: Public client and validated RPC boundary

**Consumes:** The three `VITE_` build variables and merged RPC signatures.

**Produces:** `LeaderboardConfig`, `LeaderboardEntry`, `LeaderboardSnapshot`, `parseLeaderboardConfig(values): LeaderboardConfig | null`, `createLeaderboardClient(config)` returning the official SDK client; `readLeaderboard(client, puzzleId): Promise<LeaderboardSnapshot>`, `submitLeaderboardResult(client, result, expectedOwner): Promise<'created' | 'existing'>`, `removeLeaderboardResults(client, expectedOwner): Promise<number>`. The write helpers bind the checked SDK session to their request, preventing a later identity switch from reassigning queued results.

- [ ] Write failing Vitest cases for complete public config, absent/partial config, foreign URLs and secret keys mistakenly supplied as publishable keys. Assert invalid configuration creates no SDK client or requests.
- [ ] Test literal rank 1/1/3 and outside-top-25 projection; reject invalid rank/count/name/score types, unsafe numbers, more than 25 entries, malformed own entries and unexpected submit/delete results. Do not trust a TypeScript cast over network JSON.
- [ ] Run `npm test -- src/lib/leaderboard.test.ts` from `app`; expect missing-module/export failures.
- [ ] Install `@supabase/supabase-js` with the lockfile, then implement the boundary using its official Auth/RPC methods. Validate puzzle IDs with existing domain helpers. Return controlled, useful failures without logging tokens or provider response bodies.
- [ ] Run the focused tests and `npm run typecheck`; expect green. Commit the client, dependency and checks together.

### Task 2: Anonymous participation and durable pending results

**Consumes:** Task 1 client, RPC calls and `SolveRecord`.

**Produces:** `useLeaderboard()` with stable `status`, `nickname`, `pendingCount`, `message`, `client`, `join(nickname, captchaToken, candidate?)`, `offerSolve(record)`, `stop()`, `retry()`, `removeResults()` actions. Candidate and queue entries retain exact ID/time/hints/nickname; stored ownership includes project URL and SDK user ID.

- [ ] Write failing storage/provider tests: browsing never calls sign-in; joining trims and validates 2–20 ASCII names and requires consent/CAPTCHA; failed sign-in or blocked persistence never enables publishing. Existing sessions use SDK renewal; lost sessions require explicit rejoin.
- [ ] Test queue deduplication, identical retry payloads, acknowledgment removal, the 100-entry boundary, corrupt storage, identity/project mismatch and no history import. A full queue retains old entries and reports the new solve as local-only.
- [ ] Test StrictMode initialization, two retry triggers, stop/identity change during a send, cross-tab stop and failed/offline requests. Only one drain runs; a stopped or mismatched queue never starts another write. Removal clears pending publication and waits for any in-flight write before deleting, so that write cannot repopulate removed results. Explain that a request already accepted by the server cannot be recalled by Stop alone.
- [ ] Run the focused files; expect missing implementation failures. Implement validated storage plus the provider with an online listener, SDK auth subscription and storage-event synchronization; clean up listeners. Persist before sending, catch storage/provider errors and keep local solve handling synchronous.
- [ ] Run the focused tests and typecheck; expect green. Commit this lifecycle and its tests together.

### Task 3: Rankings, joining and fresh completion integration

**Consumes:** Tasks 1–2, existing labels/date helpers, `SolvedPanel` and each stage's real completion handler.

**Produces:** `/leaderboards?id=<canonical-puzzle-id>`; optional `puzzleId` and `candidate: SolveRecord | null` props on `SolvedPanel`. The panel reads rankings for solved daily/archive puzzles even when a replay has no new candidate. Previews omit both props.

- [ ] Add failing tests for game/date/Track size selection, default today's Queens, exact-ID links, absent/future puzzles, literal rank/time/hint rendering and highlighting the owner outside the top 25. Changing selection invalidates prior loading/error/data; ignore late responses.
- [ ] Test distinct empty/loading/offline/unavailable/config-disabled states, explicit Refresh/Retry, join-on-first-solve, consent, nickname validation, Stop and confirmed owner deletion. Keep nickname text escaped; changes affect future payloads only. Failed deletion must not report success.
- [ ] Extend existing stage handler tests: all five games offer their exact first `SolveRecord`; replays and previews do not offer one; resumed clocks and hints remain unchanged. Joining on a fresh completion passes only that candidate, not all stored Stats. Stats clearing cannot delete cloud data or re-upload old solves.
- [ ] Run focused tests; expect the missing UI/handoffs to fail. Implement the page/panel/provider integration, and replace the marks stage's duplicated solved markup with the existing `SolvedPanel`. Offer fresh results at completion after local recording; retain the fresh candidate for joining on that screen.
- [ ] Implement the managed Turnstile widget with explicit render/remove, token-expiry/error handling and retry; load its script only when the join form opens. Use an accessible form and reuse existing button/picker/status styles. Never bypass the challenge in hosted tests.
- [ ] Add the Leaderboards navigation item, responsive layouts and privacy/community-reporting/timing copy. Explain identity loss and provide participation controls without adding profiles or accounts.
- [ ] Run all app tests, typecheck, lint and the `/daily-puzzles/` production build; expect green, preserving any previously recorded unrelated lint warning. Commit the complete app path.

### Task 4: Deployment and launch evidence

**Consumes:** The app from Task 3 and maintainer-owned Free project/widget.

**Produces:** Public build-variable mapping and verified launch/setup instructions; server secret remains confined to the catalog-sync step.

- [ ] Add only the three public variables to the existing trusted main build: `SUPABASE_URL` → `VITE_SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` → `VITE_SUPABASE_PUBLISHABLE_KEY`, `TURNSTILE_SITE_KEY` → `VITE_TURNSTILE_SITE_KEY`. Do not add server credentials to app/PR build environments.
- [ ] Run all app tests/build and existing CI-routing tests. Check built assets for secret/service-role values; public configuration is expected in browser assets. Update setup/disclosure/journal with actual verification, not promises.
- [ ] Browser-check desktop, 375 px and 320 px, keyboard focus, light/dark, fifth-item navigation, exact-puzzle links and a complete local solve with backend unreachable. Use test fixtures/stubs for browser failure paths, not hosted CAPTCHA bypasses.
- [ ] On the real project, verify anonymous Auth is enabled only with configured Turnstile protection and the catalog contains real puzzles. With two separate browser sessions on an approved widget hostname, complete managed CAPTCHA, submit different hint/time scores and check ranks, ties, ownership and owner-only deletion. If a development hostname is needed, have the maintainer register it explicitly; record/remove temporary test setup after proof.
- [ ] Obtain one independent whole-branch review, fix important findings with regression checks, and verify GitHub gates. Open a focused app PR and leave merging to the maintainer. Do not claim public activation while hosted checks remain blocked.

## Current setup evidence and stop condition

On October 20 the backend PR was verified merged. Public GitHub variables are configured. Live public-key checks find the ranking function and correctly deny raw result-table reads. Anonymous sign-ins are disabled, and no `SUPABASE_SECRET_KEY` exists in repository or Pages-environment secrets. A committed sample puzzle is not yet registered. Maintainer action is required for those private/provider settings; do not request their values in chat.

Stop after the complete app PR, focused verification and honest hosted evidence. No new game, timer redesign, global rankings, anti-cheat replay system, additional provider or bulk-upload feature belongs to this slice.
