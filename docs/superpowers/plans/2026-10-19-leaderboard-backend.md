# Leaderboard Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and prove the free leaderboard database/API and catalog tooling, without enabling the public feature yet.

**Architecture:** Supabase Auth identifies anonymous players. Narrow Postgres functions expose ranked results and owner-only writes; a trusted deployment imports the known puzzle catalog. Test database behavior in disposable PostgreSQL containers, then perform real Supabase Auth smoke checks before public launch.

**Tech Stack:** PostgreSQL 17, SQL, Docker, Node.js 22 built-ins, existing GitHub Actions. No new application dependency in this slice.

**Spec:** `docs/superpowers/specs/2026-10-19-anonymous-leaderboards-design.md`.

## Global Constraints

- Operating cost must remain $0.
- Never enable a paid plan, add-on or billing upgrade automatically.
- Preview boards never publish or appear in the catalog.
- Keep `storeSolve` local and synchronous.
- No live subscriptions or timer-driven requests.
- Retain the first result per anonymous identity and exact puzzle.
- No browser exposure of authentication IDs, private tables or administrative keys.
- App/participation/Turnstile UI is the next PR; no navigation or published-feature claim in this slice.

## Review Focus

- Simultaneous submissions and retries must leave one immutable first score; Task 1 tests both.
- Removing public results must not reset the 20-per-minute write limit; Task 1 tests a private counter.
- Unauthenticated callers must see ranks but never private identities or direct-table writes; Task 1 tests real roles.
- Catalog input or a network failure must not leak the server key or partially publish a batch; Task 2 tests rejection and errors.
- Missing configuration must keep current Pages deployment working; Task 3 tests routing and conditional synchronization.

## File map

- `backend/leaderboard/migrations/001_leaderboards.sql`: tables, indexes, grants and RPC functions.
- `backend/leaderboard/tests/auth-fixture.sql`: disposable test roles and a minimal Supabase-compatible `auth.uid()` context; never deployed.
- `backend/leaderboard/tests/contract.sql`: transaction-based score/access checks.
- `backend/leaderboard/test.sh`: owns an ephemeral PostgreSQL container, runs SQL and concurrent-request checks, cleans up on exit.
- `backend/leaderboard/sync-catalog.mjs` and `.test.mjs`: read published metadata and import it using Node built-ins.
- `.github/workflows/leaderboard.yml`: focused backend SQL/catalog checks.
- `.github/workflows/ci.yml`: trusted main-only catalog sync before the existing Pages build.
- `.github/scripts/ci_scope.py` and its existing tests: recognize isolated backend changes without running unrelated generation tests.
- `docs/leaderboard-setup.md`: exact schema/test/deployment commands and activation ordering.

### Task 1: Database contract and ownership

**Consumes:** The approved ranking, privacy and first-result rules.

**Produces:** These public-schema RPC signatures (all tables stay inaccessible to browser roles):

```text
register_leaderboard_puzzles(p_puzzles jsonb) -> integer   [service_role only]
submit_result(p_puzzle_id text, p_nickname text, p_elapsed_ms bigint, p_hints bigint) -> jsonb
get_leaderboard(p_puzzle_id text) -> jsonb
remove_my_results() -> integer                          [authenticated only]
```

`submit_result` returns `{status: "created" | "existing"}`. It takes no user ID.
`get_leaderboard` returns `{entries, total, own_entry}`; each entry contains
`rank`, `nickname`, `elapsed_ms`, `hints`, `is_you`. `own_entry` is null unless
the caller has a result outside the first 25. Unknown or not-yet-available IDs
are rejected, not interpreted as an empty board.

- [ ] Write `contract.sql` assertions for hints-before-time, shared ranks 1/1/3,
  all three Track sizes, an outside-top-25 owner, and no public owner identifiers.
  Use fixed literal scores; register dates relative to the test clock.
- [ ] Assert unauthenticated and forged-owner writes fail; caller A cannot read
  raw result rows, overwrite or delete B's rows, or register puzzle metadata.
  Check missing identity, invalid names, invalid/unsafe numbers, unknown IDs and
  dates after the current UTC+14 day.
- [ ] Assert retries retain the original score, duplicate retries do not consume
  the rate allowance, and deleting results does not allow a 21st new write in
  the same minute. Assert owner deletion changes ranks but not other entries.
- [ ] Add `test.sh` using `postgres:17`, a unique task container name and an EXIT
  cleanup trap. Wait up to 30 seconds for readiness, load the test-only Auth
  fixture, migration, then contract with `psql -v ON_ERROR_STOP=1`. No remote URL
  or production database is accepted by this script.
- [ ] Run `bash backend/leaderboard/test.sh`; verify the missing migration fails.
- [ ] Implement the migration: safe integer bounds 0–9007199254740991, trimmed
  2–20 character nickname constraint, unique owner/puzzle, score ordering index,
  RLS, explicit grants and qualified SECURITY DEFINER functions. Serialize new
  submissions per owner; keep the rate counter separately from deletable results.
  Use server time and the `Pacific/Kiritimati` date for the availability boundary.
- [ ] Test two concurrent authenticated inserts against one owner/puzzle using
  separate `psql` sessions. Assert exactly one row and no replacement; the
  disposable database is destroyed afterward.
- [ ] Run the full database script again; expect a zero exit code and explicit
  contract/concurrency success. It tests PostgreSQL permissions and RPC logic,
  not real HTTP authentication or provider CAPTCHA; record that distinction.
- [ ] Commit the schema and its checks together.

### Task 2: Known-puzzle catalog import

**Consumes:** `register_leaderboard_puzzles(p_puzzles jsonb)` from Task 1.

**Produces:** `readCatalog(directory): Promise<CatalogEntry[]>` and
`syncCatalog({url, secretKey, directory, fetcher = fetch}): Promise<number>` in
`sync-catalog.mjs`. Entry fields are `puzzle_id`, `puzzle_type`, `puzzle_day`,
`width`, `height`, `size_label` (null or Small/Medium/Large).

- [ ] Write Node test cases with temporary literal JSON files for all five games,
  the three Track sizes and an original unsized Tracks board. Require file stem
  equal to ID, real date, matching type/suffix, and positive integer dimensions.
  Convert marks/Trio `size` into width/height; do not send letters or solutions.
- [ ] Test corrupt/foreign JSON fails before any request, a failed/non-JSON API
  response produces a safe error, and neither console output nor error text
  contains a supplied fake secret. Test a successful request sends the metadata
  batch and correct authorization; the RPC upsert is atomic and preserves old rows.
- [ ] Run `node --test backend/leaderboard/sync-catalog.test.mjs`; verify failures.
- [ ] Implement with `node:fs/promises`, JSON parsing and `fetch`; no SDK or new
  package is needed for this trusted one-request importer. The CLI reads only
  `SUPABASE_URL`, `SUPABASE_SECRET_KEY` and the committed `app/public/puzzles`
  directory. Missing either required setting is a clear error, not a silent sync.
  Log only record count and success/failure, never credentials or raw API bodies.
  Send the new `sb_secret_...` key in the `apikey` header, not as a Bearer JWT.
- [ ] Run the Node tests and the database tests, including registering the same
  metadata twice without deleting existing score rows; expect both to pass.
- [ ] Commit catalog import and tests together.

### Task 3: Focused checks and safe deployment setup

**Consumes:** The SQL test script and catalog importer from Tasks 1–2.

**Produces:** CI proof and a repeatable main-only setup path, with the public
feature still disabled until the later app PR and configured hosted checks.

- [ ] Extend existing CI-scope tests: isolated `backend/leaderboard/` changes
  skip the Python engine; puzzle JSON, engine code, unknown paths and main runs
  still require it. Run the current unittest command and verify the new backend
  case fails before adding the narrow allowlist entry.
- [ ] Add `leaderboard.yml` for backend/workflow path changes and main, running
  Node catalog tests and the disposable SQL script on standard Ubuntu runners.
  Use read-only repository permissions; it receives no hosted credentials.
- [ ] Add a catalog step in the existing trusted main deploy job, before the
  Pages build, enabled only when the maintainer sets the server secret. Keep the
  key in that one step's environment, never a job-wide or `VITE_` variable. A
  configured sync failure blocks that deploy instead of publishing an app with
  a stale catalog. With no secret configured, existing deployment is unchanged.
- [ ] Update setup instructions with the exact migration path, local SQL test
  command and catalog command. The maintainer applies reviewed SQL in Supabase,
  enables CAPTCHA/anonymous Auth, then configures the GitHub secret. Public app
  variables remain unset until the subsequent app slice. Never ask for a database
  password, Turnstile secret or Supabase secret key in chat.
- [ ] Run `python3 -m unittest discover -s .github/scripts -p 'test_ci_scope.py'`,
  `node --test backend/leaderboard/sync-catalog.test.mjs`,
  `bash backend/leaderboard/test.sh`, and `git diff --check`. Run existing app
  tests/build if runtime app files are touched; do not change them just to add
  this backend. The hosted Auth/CAPTCHA smoke check remains a launch gate.
- [ ] Obtain one independent whole-branch review, fix important findings, and
  verify the relevant checks again. Rename the draft PR around the delivered
  backend behavior, wait for GitHub checks, and leave merging to the maintainer.

## Stop condition

The first slice ends with a tested schema/API, catalog tooling and accurate
setup instructions. It must not ship a pretend leaderboard or claim that the
real provider has been configured. The next app plan owns all participation,
pending queue, navigation, ranked UI, sharing/privacy copy and browser checks
from the spec; public launch waits for that slice and two hosted anonymous users.
