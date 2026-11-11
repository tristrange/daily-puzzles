# Horse Enclosure reveal and leaderboard implementation plan

> For agentic workers: use subagent-driven development with disjoint file ownership. Every implementation starts on a new branch in an isolated worktree.

**Goal:** After a valid submission, reveal one verified optimal enclosure; rank only the player's first submitted area, then total active time, while allowing personal improvements.

**Architecture:** Publish independently validated optimal wall witnesses beside immutable puzzle JSON. Cache witnesses with downloaded puzzles; bundle preview witnesses. Extend the existing optional leaderboard with a separate scored submission RPC and an immutable local first result.

**Tech stack:** Existing React/TypeScript, Python CP-SAT, static JSON, PostgreSQL/Supabase. No new runtime dependency.

**Spec:** User requests in this chat: reveal only after submission; add a leaderboard; first score counts; larger area wins, then faster time; improvements remain available after reveal.

## Shared contracts

- Daily witness URL: `solutions/enclosure/<puzzle-id>.json`, relative to the app base path.
- Witness object: `{ "version": 1, "id": "YYYY-MM-DD-enclosure", "board": "<fingerprint>", "walls": [0, 1] }`. The example walls illustrate the shape only.
- Fingerprint is the compact JSON array `[size, water, horse, wallBudget, optimalScore]`, identical to TypeScript `enclosureFingerprint`. Walls are sorted row-major indices.
- Validate exact id and fingerprint, wall legality/budget, enclosed status, and evaluated score equal to the puzzle's certified optimum. No browser optimizer. Python generates only from `OptimalResult` with matching bound and independently evaluated witness.
- Preview witness array: `app/src/domain/enclosurePreviewSolutions.json`, in preview order, using `2000-01-01-enclosure`, `2000-01-02-enclosure`, etc.
- CLI: `uv run python -m tools.enclosure_solutions --puzzles DIR --out DIR --previews FILE --preview-out FILE [--check]`. Defaults point to the repository's daily/preview locations. Write missing files only; check mode is read-only and rejects missing, stale, illegal, non-optimal, noncanonical, or orphan witnesses. A corrupt existing witness aborts instead of being silently replaced.
- `SolveRecord.enclosureFirst?: EnclosureBest` preserves the first submitted layout, area, fingerprint and achievement time. It must match the record's original `solvedAt`; later improvements and backup merges cannot replace it. Legacy completions without this field remain valid personal history and are ineligible for ranked submission.
- Export `validatedEnclosureFirst(record, grid): EnclosureBest | null` beside `validatedEnclosureBest`.
- `LeaderboardResult.score?: number` and `LeaderboardEntry.score?: number`: area is required and positive for enclosure; omitted for other families. Validate at API/outbox boundaries. Existing participation, identity, nickname, retry and privacy flows remain in use.
- Dedicated RPC `submit_enclosure_result(p_puzzle_id text, p_nickname text, p_elapsed_ms bigint, p_score integer, p_attempt_elapsed_ms bigint default null)` returns the existing `{status: 'created' | 'existing'}` shape. Ordinary `submit_result` keeps its current API.
- Backend catalog adds nullable `max_score`; enclosure rows require their published optimum. Results add nullable `score`; enclosure requires score, zero hints, and score no greater than its catalog optimum. Ordinary families retain their existing score shape and ranking.
- Enclosure ranks by descending score, then ascending `elapsed_ms`. Equal area and time share rank. First server write per player/puzzle remains immutable under retries, improvements and concurrency.
- Reveal is a separate read-only board. The editable attempt, best, first result, clock and undo history are preserved. Reveal itself never submits or overwrites a result. Improvements remain personal; previews never publish.

## Global constraints

- Preserve every previously published puzzle byte, identity, saved progress, first-completion time, ordinary leaderboard result and offline play path.
- Existing completed puzzles may reveal; do not invent their original area from their improved best.
- Use only local disposable databases for implementation verification. Prepare production migration/deployment instructions for maintainer review; do not mutate the hosted project.
- Keep existing public puzzle JSON witness-free; expose witnesses only through the separate solution resource and reveal UI.

## Work and file ownership

1. **Python witnesses — Terra A.** New `engine/src/queens_engine/enclosure_solution.py`, `engine/tools/enclosure_solutions.py`, focused engine tests, daily witness corpus, preview witness JSON. Test-first for legality/binding/certification, missing/corrupt files, canonical serialization, idempotence, previews. Root owns workflow wiring.
2. **Database and catalog — Terra B.** New CLI-named migration in `backend/leaderboard/migrations/`, SQL contract/upgrade tests, `backend/leaderboard/test.sh`, catalog sync and its tests. Preserve RLS/grants, future-date restrictions, owner locks, first-write uniqueness and rate limits. Test existing families, equal ranks, area/time ordering, rejection of invalid area, duplicate and concurrent submissions, and repeatable upgrades. No hosted writes.
3. **First result and leaderboard client — Terra C.** `stats.ts`, `enclosureResults.ts`, `leaderboard.ts`, `leaderboardProgress.ts`, their focused tests, `LeaderboardPanel`, `LeaderboardsPage` and their tests. Freeze first result through improvements/imports/reload; queue only that area; permit late opt-in; reject legacy unknown first scores. Add area rendering and ranking copy while preserving normal tables. Do not edit the enclosure stage or board.
4. **Reveal and integration — Sol.** Enclosure witness parser/loader/cache, puzzle download integration, read-only board support, reveal panel, enclosure stage first-submit/leaderboard hook wiring, preview wiring, rules/docs, nightly/CI witness generation/checking. Test pre-submit gating, corrupt/missing/offline/retry paths, preserved attempts/history/results, improvement after reveal, preview isolation and base paths.

## Execution checks

- [x] Write focused failing tests before each behavior change; verify they fail for the intended reason.
- [x] Implement each owned unit and run its focused tests, type/lint checks, then commit in its own branch.
- [x] Sol reviews and integrates commits; no concurrent writers to shared files.
- [x] Run app and engine suites, type/lint/build/format checks, SQL/catalog tests, full puzzle archive replay, schema-ID checks and complete witness verification.
- [x] Browser checks in Chromium/WebKit at phone, tablet and desktop sizes; light/dark palettes; keyboard/touch emulation; offline reveal; immutable ranked result with continued improvement. Report physical-device/assistive checks separately.
- [ ] Independent review, open a PR with screenshots and deployment prerequisites, wait for checks; maintainer reviews and merges.

## Review focus

Legacy first scores cannot be reconstructed. Cache entries must match the exact grid. A reveal may fail independently of puzzle play. Pending uploads must retain original area/time and player identity. Old API calls and ordinary ranking must survive the database migration. Missing solution files must fail the publication gate, and nightly commits must include newly generated witnesses.
