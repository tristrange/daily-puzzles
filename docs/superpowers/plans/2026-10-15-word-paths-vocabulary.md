# Word Paths Vocabulary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Accept ordinary English words on new Word Paths boards without weakening uniqueness or old-board replay.
**Architecture:** Frozen SCOWL acceptance v2, familiar v1 answer pool, version-aware grids and storage.
**Tech Stack:** Existing Python/TypeScript, React/Vite/Vitest/pytest; no new runtime dependencies.
**Spec:** docs/superpowers/specs/2026-10-15-word-paths-vocabulary-design.md

## Global Constraints

- 16,781 normalized 3–6-letter words; preserve v1 vocabulary/recipe/golden files.
- V2: fifty frozen-v1 candidates, eight extra paths maximum, 500,000 shared states; >=95% of 100 representative seeds independently unique.
- Preserve existing published puzzles and v1 progress; only unpublished word batch may change.
- Existing feat/word-paths-daily PR73; no merge or direct production deploy.

## Review Focus

- Unknown versions reject rather than silently using the latest dictionary.
- V1 parsing/replay/gameplay still use the v1 list.
- V2 replay and independent counters prove full-dictionary uniqueness.
- Old saved attempts cannot become invalid accepted paths or be overwritten by v2.
- Only the unpublished Word Paths batch changes; ordinary publisher remains idempotent.

## Task 1 — Frozen data, versioned engine and contract

**Files:** word_paths.py, new word_paths_gen_v2.py and acceptance file/provenance/license, rulebook.py, puzzle.py, schema, engine contract tests.
**Produces:** vocabulary_version=1/2 grids, v2 generation and exact v1 replay.
- [x] Write failing tests for missing CAME/MEGA/ERA, v1/v2 parser context, unknown versions, full-vocabulary ambiguity rejection and replay.
- [x] Run focused tests; expect v2 import/contract failures.
- [x] Add pinned data and minimal version context; implement bounded v2 constructor using frozen v1 candidates.
- [x] Verify focused and full engine suite; measure 100 seeds and independent covers.
- [x] Commit the versioned engine and contract.

## Task 2 — Browser acceptance and saved attempts

**Files:** wordPaths.ts, puzzle.ts, wordGame.ts, wordProgress.ts, WordPathsStage.tsx and tests.
**Consumes:** v2 contract and vocabulary from Task1.
- [ ] Write failing legal-path acceptance, old-board rejection, unsupported-version and v1/v2 progress-isolation tests.
- [ ] Run focused app tests; expect rejection of v2/new words.
- [ ] Select acceptance by grid version and preserve v1 progress keys.
- [ ] Run app test/type/lint/build gates and commit.

## Task 3 — Preview and daily batch

**Files:** v2 conformance samples, preview page, unpublished seven daily files, documentation and screenshots.
- [ ] Regenerate only unpublished Word Paths files and ten v2 preview files; retain original v1 fixtures.
- [ ] Verify replay/independent uniqueness, missing-slot resume and preservation of old files.
- [ ] Browser-check new word acceptance, preview isolation and daily results; capture evidence.
- [ ] Run final full gates, update PR73, request one fresh-context final review, wait for CI and report ready for maintainer merge.
