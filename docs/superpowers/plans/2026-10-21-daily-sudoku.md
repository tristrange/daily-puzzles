# Daily Sudoku Implementation Plan

**Goal:** Release three daily Sudoku levels through the existing puzzle system.
**Architecture:** Keep the Sudoku model and stage. Extend the established
rulebook, shared manifest, parser and production completion seams.
**Stack:** Existing Python, TypeScript/React, JSON Schema and PostgreSQL; no new dependencies.
**Spec:** [Daily Sudoku design](../specs/2026-10-21-daily-sudoku-design.md).

## Shared interfaces

- Family `sudoku`; activation 2026-10-21; daily suffixes `-sudoku-easy`,
  `-sudoku-medium`, `-sudoku-hard`; no unsized slot.
- Board `{size:9, level:"easy"|"medium"|"hard", givens:number[81]}`;
  generatorVersion 1; omit numeric difficulty. ID and level must agree.
- Preview IDs and saves remain unchanged. Daily completion and progress reuse
  existing first-result and local-storage patterns. Level labels travel in
  catalog `size_label`; no database API changes.

## Tasks and ownership

1. **Engine and shared contract** — `engine/src/queens_engine/`, affected engine
   tools/tests, `schema/`, `conformance/`. First add focused failing daily-contract
   checks, then implement SudokuRulebook, bounded generation and replay. Preserve
   preview outputs; check unsupported IDs/version, wrong level, budget exhaustion
   and activation boundaries. Supply cheap deterministic seeds for integration.
2. **Daily app** — `app/src/` except shared assets outside that tree. Add failing
   parser/daily lifecycle checks, then register IDs and SudokuGrid, adapt progress
   and stage, and integrate lazy play/Today/archive/stats/share/rules/leaderboards.
   Verify preview isolation, replay first-result preservation, separately keyed
   levels and offline loads. Preserve all merged Sudoku controls.
3. **Leaderboard upgrade** — `backend/leaderboard/` and its setup documentation.
   Add migration 003, catalog support and focused contract/upgrade checks. Prove
   old rows/permissions survive and migration retries preserve Sudoku scores.
   Report exact SQL for the maintainer; do not access production credentials.
4. **Publication and integration** — generate today's three boards plus lead
   horizon into `app/public/puzzles/`; do not rewrite older files. Run generation
   twice and require a no-op second run. Run full gates and archive replay, repair
   cross-layer issues, browser-check one daily completion and existing preview.
   Refresh README/pipeline/journal, request independent review, open a focused PR
   and wait for checks. Maintainer applies SQL and merges.

## Review focus

Check ID/level mismatches at every boundary; interrupted publish resumption;
first-solve and hint count preservation; preview-to-daily save isolation; and
database upgrades preserving unrelated scores and permissions. Avoid expensive
generation duplication in the ordinary test suite.
