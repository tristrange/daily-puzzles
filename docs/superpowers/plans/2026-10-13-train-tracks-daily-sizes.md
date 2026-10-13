# Daily Train Tracks Sizes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish Small 8×8, Medium 10×10 and Large 12×12 every day, with separate playable pages, saved unfinished boards, timers and solves.

**Architecture:** Keep one Train Tracks family and renderer. A small shared variant contract extends IDs and daily slots; the existing publisher generates each slot independently. Add Train Tracks-only progress storage, using the full ID and a board fingerprint. Reuse existing controls and appearance tokens.

**Tech Stack:** Existing Python, React, TypeScript, pytest, Vitest and browser verification. No new dependencies.

**Spec:** [Approved two-PR design](../specs/2026-10-13-train-tracks-sizes-design.md), PR 2. Native execution and routine decisions are authorized; do not request another implementation-method or plan approval.

## Global Constraints

- Labels are Small, Medium and Large, never difficulty ratings; sizes are 8×8, 10×10 and 12×12.
- Preserve generator version 3's frozen 10,000-state checks and 1,000,000-state seed allowance, nonzero clues, separated givens, caps and uniqueness proof.
- Use `YYYY-MM-DD-tracks-small`, `-medium`, and `-large`; retain historical `-tracks` IDs and every existing published file.
- Pin activation to **2026-10-17**, after both the latest committed legacy date (October 15) and today's publisher lead (October 16). Recheck main before publishing the PR; move the cutoff forward if newer legacy content requires it.
- Store activation and variant suffixes, dimensions and labels in `conformance/id-cases/manifest.json`; both languages read this contract.
- Keep the existing puzzle envelope: no redundant size/difficulty field. Sized IDs must match their declared family and dimensions in both parsers.
- Keep local-only storage, Auto/system appearance, existing stats categories and first-solve handling. Unfinished Train Tracks progress pauses while another page is open; undo history remains local to the current visit. Completed boards start fresh for replay; solve records persist.
- Preserve the publishing/verification/hint-baseline/deployment workflow. Include all three variants for activation and its following three days.

## Review Focus

- An interrupted publication must resume missing variants without replacing any already written board (Task 2).
- Sized IDs with a different family, dimensions or impossible date must be rejected rather than routed incorrectly (Task 1).
- Malformed/stale stored progress must not change givens or restore a different board's state (Task 3).
- Moving between sizes or reloading must preserve unfinished boards and independent timers; completed restoration must not duplicate solves (Tasks 3–4).
- New legacy puzzles published on main during this PR must remain accessible and push the activation date forward when necessary (Task 5).

## Files and responsibilities

| Files | Responsibility |
| --- | --- |
| `conformance/id-cases/manifest.json`, `schema/puzzle.schema.json` | Shared variant contract, ID examples and generated suffix pattern. |
| `engine/src/queens_engine/track_sizes.py`, `app/src/domain/trackSizes.ts` | Read the shared contract and classify variant suffixes. |
| `engine/src/queens_engine/rulebook.py`, `puzzle.py`, `tools/generate.py`, `tools/schema_ids.py` | Variant generation, daily slots, ID and envelope validation, manual generation. |
| `engine/tools/publish.py`, `engine/tests/test_tools.py` | Slot enumeration, restart/idempotence and bounded retries. |
| `app/src/domain/dates.ts`, `puzzle.ts` and conformance tests | Parse sized routes and validate named dimensions. |
| `app/src/lib/trackProgress.ts`, tests, `components/TracksStage.tsx` | Per-ID unfinished board and timer persistence. |
| `app/src/pages/HomePage.tsx`, `ArchivePage.tsx`, `StatsPage.tsx`, `components/PuzzleView.tsx`, `lib/puzzles.ts`, `share.ts`, `App.css` and tests | Group three size links in one card, show labels consistently, preserve family grouping. |
| `app/public/puzzles/`, hint baseline, READMEs, pipeline docs and journal | Validated initial content, reproducible commands, rollout and measurement evidence. |

### Task 1: Shared identity and sized generation

**Interfaces:**
- Add `TrackSize = Literal["small", "medium", "large"]` and frozen `TrackVariant(name, suffix, side, label)` in `track_sizes.py`; `TRACK_VARIANTS` is ordered Small/Medium/Large and `TRACK_SIZES_START` is the shared activation date.
- `track_variant(identifier: str) -> TrackVariant | None` classifies an exact variant suffix; calendar validation belongs to ID parsing.
- Extend `puzzle_id(day, puzzle_type, *, track_size: TrackSize | None = None)` without changing legacy calls or `split_puzzle_id(value) -> tuple[date, PuzzleType] | None`.
- Add `Rulebook.daily_ids(day: date) -> tuple[str, ...]`, defaulting to one legacy ID. Train Tracks returns one legacy ID before activation and three sized IDs afterward.
- The TypeScript counterparts are `TrackSize`, `TrackVariant`, `TRACK_VARIANTS`, `TRACK_SIZES_START`, and `trackVariantOf(id)`. Extend `puzzleIdFor(day, type, trackSize?)`; preserve `puzzleIdParts`' existing `{day,type}` result shape. `puzzleIdsForDay` returns three or five slots according to activation.
- `TrackRulebook.generate` derives dimensions from a sized ID, preserving legacy 7×7 generation and all replay policies. Keep `id_for_day(date_text, puzzle_type)` and recognize full sized IDs through the existing `--date` flag; refuse a full ID whose family conflicts with `--type`. No additional CLI flag is needed.

- [x] Add shared ID cases for all three suffixes, unknown sizes, impossible dates, duplicate suffixes and unchanged legacy IDs. Add shared `boardCases` in the ID manifest referencing three new generated track fixtures under `conformance/id-cases/` and an existing Queens fixture, with ID/type/dimension overrides and accept/reject expectations; test these in both language ID conformance suites.
- [x] Write failing tests in `test_conformance_ids.py`, `test_rulebook.py`, `test_tools.py`, `idConformance.test.ts`, `dates.test.ts`: legacy IDs unchanged; each named size round-trips; incorrect type/dimensions reject; the October 16 schedule has three slots and October 17 has five. Explicitly pin the three sides and activation date.
- [x] Run focused tests RED: engine `pytest tests/test_conformance_ids.py tests/test_rulebook.py tests/test_tools.py -q`; app `npm test -- src/domain/idConformance.test.ts src/domain/dates.test.ts`. Expected: new variant expectations fail.
- [x] Implement the contract readers, ID helpers, daily slots, parsers and generation CLI. Sized parser validation checks canonical day, `train-tracks` type, square named dimensions; legacy validation stays compatible.
- [x] Extend `schema_ids.expected_pattern` with variant suffixes and regenerate the schema. Do not broaden it to arbitrary suffixes.
- [x] Run focused suites GREEN, engine `pyright`, `ruff check .`, `ruff format --check .`, `python -m tools.schema_ids --check`, and app `npm run typecheck`. Expected: all pass.
- [x] Update README manual-generation examples and commit `feat: define daily Train Tracks size identities`.

### Task 2: Publish and resume the new daily slots

**Interfaces:**
- Consume `book.daily_ids(day)` in `_ids_for_day` and the publishing loop. `_generate` still hashes the full ID and returns `(Puzzle, score)` with bounded seed retries.
- Keep `verify`'s filename/type/replay checks; additionally require the envelope ID to equal its filename stem, preventing a valid small envelope hidden in a large-named file.

- [x] Write failing publication tests: one legacy tracks slot on October 16; all three on October 17; resume only a missing medium variant; idempotent reruns preserve bytes; exhaust all 32 seed retries without falling back to 7×7. Add filename/envelope mismatch verification.
- [x] Make existing window tests calendar-stable by freezing their clock before activation, while new transition tests set explicit dates on either side. Keep real generation integration tests alongside mocks for failure paths.
- [x] Run `pytest tests/test_tools.py -q` RED; expected: new schedule/resume assertions fail.
- [x] Implement slot iteration and verification. Keep Star Battle layout avoidance and Queens ramp unchanged. Update publishing docstrings and pipeline documentation to describe three/five slots rather than one per family.
- [x] Run `pytest tests/test_tools.py tests/test_rulebook.py -q` GREEN and engine static checks. Expected: all pass; generation preserves the selected ID/dimensions and failed seeds remain explicit.
- [x] Commit `feat(engine): publish all three Train Tracks sizes daily`.

### Task 3: Preserve unfinished Train Tracks progress

**Interfaces:**
- Add `TrackProgress { game: TracksGame; elapsedMs: number }` and `readTrackProgress(id: string, grid: TrackGrid): TrackProgress | null`, `storeTrackProgress(id: string, game: TracksGame, elapsedMs: number): boolean`, `clearTrackProgress(id: string): void` in `app/src/lib/trackProgress.ts`.
- Storage keys include the full puzzle ID. A versioned snapshot contains the board fingerprint, cell values (including Cross/Maybe) and nonnegative elapsed milliseconds. Invalid values, changed givens, wrong board fingerprints and completed boards do not restore. Storage failures remain non-fatal; return saving success so the stage can warn only when an actual save fails.
- `TracksStage` initializes from the saved snapshot; elapsed time resumes from that value and pauses between visits. Save on edits, periodic timer updates and page exit. Clear unfinished progress upon solving; retain first-solve statistics and the existing replay behavior. Undo remains bounded and visit-local.

- [x] Write `trackProgress.test.ts` RED: independent small/medium/large keys, pieces and notes round-trip, elapsed values differ, immutable givens preserved, corrupt/version-mismatched/stale snapshots rejected, unavailable storage handled, completed snapshots ignored/cleared.
- [x] Add `stats.test.ts` regressions: three same-day variants count as three Train Tracks solves but one streak day; replaying Small preserves its first solve without blocking Medium or Large.
- [x] Run `npm test -- src/lib/trackProgress.test.ts src/lib/stats.test.ts` RED; expected: missing progress functions/new expectations fail.
- [x] Implement the storage helper and wire TracksStage, preserving pure game transitions and solved detection. Do not introduce generic storage infrastructure or persist undo history.
- [x] Run focused tests GREEN, `npm run typecheck` and `npm run lint`. Expected: pass; browser integration proof follows in Task 5.
- [x] Commit `feat(app): save each Train Tracks board independently`.

### Task 4: Show sizes throughout the player interface

**Interfaces:**
- Export pure `TodayCards({probes, solved})` from `HomePage.tsx`, using existing `ProbedPuzzle` and `ReadonlySet<string>`; HomePage retains fetching/calendar state. Group sized probes into one Train Tracks card with three separate links and independent solved/unpublished states.
- Reject a fetched envelope whose ID differs from the requested route, so a valid Small payload cannot be played or saved under a Large link. Add optional dimensions to `PublishedPuzzle`, populated from fetched boards; legacy fixtures remain compatible. Archive rows display named sizes and dimensions; historical 7×7 rows show dimensions without a size label.
- Add `puzzleId: string` to internal `ShareResult`, used to obtain a named size from the ID. Update both stage callers and share test fixtures. Recent solves use the same variant labels, while all variants remain in the Train Tracks statistics family.

- [x] Write failing `HomePage.test.tsx` SSR tests with controlled probes: exactly one Train Tracks card, three correct links/labels, Small solved without marking the others, missing Medium shown independently, and unchanged legacy card. Follow the existing ArchiveGroups renderer pattern without new dependencies.
- [x] Extend archive, puzzle-list, share and StatsPage tests: all three IDs survive discovery/grouping, a different ID returned for a requested route is rejected, size labels/dimensions appear, legacy 7×7 is unlabelled, and recent solves distinguish sizes.
- [x] Run focused app tests RED; expected: new links/labels/dimensions fail.
- [x] Implement labels on Today, puzzle headings, archive, shares and recent solves. Reuse the existing typography, appearance tokens and 44px controls. Stack clear size links inside the single Train Tracks card; do not add a page selector that discards state or any difficulty labels.
- [x] Run the complete app suite, typing/lint and build GREEN. Expected: pass with no new dependencies or theme changes.
- [x] Commit `feat(app): offer Small Medium and Large Train Tracks`.

### Task 5: Content, browser proof and PR delivery

- [x] Generate all three variants for October 17–20 using the real publisher recipe, full-ID seed hash and bounded retries. Independently validate each returned board using the established benchmark validator. Add only the 12 new sized files; preserve every existing corpus byte.
- [x] Generate ten consecutive days of the three tracks slots in a temporary directory with the real `_generate` path. Measure all three boards plus validation per day, retain failed seed/outcome reporting, and require each day to complete within 60 seconds. Verify the temporary corpus; do not use a wall-clock limit inside generation policy.
- [x] Regenerate the hint baseline with `python -m tools.hint_baseline --write`; keep track entries handled by the existing genre gate.
- [x] Use the actual TodayCards renderer for a temporary future-day browser preview rather than changing the machine clock or adding a product debug mode. Remove that preview before the final commit.
- [x] Browser-check Today/legacy archive/new puzzle pages/share labels, light and dark appearances, Auto preservation, 320px/390px/desktop widths, no horizontal overflow and 44px picker/size controls. Measure the 12×12 cell size. Exercise pointer and keyboard play, reload, switching sizes, timer restoration and independent solve records.
- [x] Run final engine suite, typing/lint/format, corpus verify, schema check and app suite/typing/lint/build. Expected: all pass. Record exact outcomes, ten-day timings and mobile cell measurements in the journal; update READMEs and pipeline docs.
- [x] Fetch main and confirm activation still follows every committed legacy tracks date, including queued/published future content. If necessary move activation and the owned initial batch forward, preserving existing main files; rerun affected tests and verify.
- [ ] Commit `test: verify daily Train Tracks variants and rollout`. Request the single independent whole-branch review, address actionable findings, then open/attach the next PR and await its checks. Leave merging to the user.
