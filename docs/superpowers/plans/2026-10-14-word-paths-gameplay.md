# Word Paths Gameplay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement task-by-task; one independent final review.

**Goal:** Deliver a playable English Word Paths preview with safe progress and accessible input.
**Architecture:** Separate pure word game rules, local progress and board/stage presentation; reuse existing puzzle parsing, theme, result panel and stats. A dedicated preview imports ten answer-free files while daily publication remains off.
**Tech Stack:** Existing React, TypeScript, Vitest, Python/pytest; no new dependencies.
**Spec:** `docs/superpowers/specs/2026-10-14-word-paths-gameplay-design.md`

## Global Constraints

- English frozen v1 vocabulary; no solver, hints, new words or daily activation.
- Orthogonal disjoint paths, distinct unused lengths, complete coverage to win.
- Touch policy `pinch-zoom`, cancellation restores pre-gesture selection.
- Preview route `#/preview/word-paths?board=N` with N 1–10, isolated storage and no stats.
- Existing puzzle bytes, first solves and Auto/system theme default unchanged.
- Branch `feat/word-paths-gameplay`, PR title uses `feat:`; maintainer merges.

## Review Focus

- Interrupted/secondary pointer gestures must not submit or create a solve.
- Rapid selection then submit must use the latest trace, not a stale render.
- Restored malformed paths and overlapping words must fail closed.
- Preview results/shares must neither pollute stats nor link to unpublished daily files.
- Hidden or unmounted time must not inflate a restored attempt.

### Task 1: Pure rules, shared path cases and safe progress

**Files:** `app/src/domain/wordGame.ts`, `wordGame.test.ts`, `app/src/lib/wordProgress.ts`, `wordProgress.test.ts`, shared path fixture JSON and Python test.
**Interfaces:** Consumes WordGrid and WORD_PATHS_VOCABULARY. Produces WordGame, createWordGame(grid), spellPath(grid,cells), traceCell(game,cell), clearTrace(game), submitWord(game):{game,accepted,message}, undoWord(game), resetWordGame(game), isWordSolved(game); read/store/clearWordProgress(id,grid/game,elapsedMs,preview=false).

- [x] Write tests for legal turns, diagonals/wrap/blockers/reuse, truncation, invalid words/lengths/overlap, reversed accepted spelling and full coverage. Share geometry cases with Python spell_path.
- [x] Write progress tests for traces/words/elapsed, corrupt/stale/overlapping/invalid snapshots, missing storage, completed cleanup and preview isolation.
- [x] Run new tests; expect missing modules/functions to fail.
- [x] Implement only the specified pure state transitions and validated persistence.
- [x] Run focused Vitest and Python path fixtures; expect pass; commit `feat: add Word Paths rules and saved progress`.

### Task 2: Tracing board, stage, results and preview route

**Files:** `app/src/components/{WordPathsBoard,WordPathsStage}.tsx`, board markup tests, `app/src/lib/share.ts` and tests, `app/src/pages/WordPathsPreviewPage.tsx` and tests, `App.tsx`, `PuzzleView.tsx`, `RulesPage.tsx`, `App.css`.
**Interfaces:** Consumes Task 1 game/progress functions. Board callbacks select(cell):readonly number[], restoreTrace(path), submit(), undo(); stage accepts puzzle, grid, timeZone and previewBoard?:number. Preview route owns Board 1–10 selection. Existing result/stats/clipboard APIs remain intact.

- [x] Write markup, preview/route/isolation and spoiler-share tests; run them and expect missing behavior.
- [x] Implement immediate trace feedback, pointer capture/cancel/backtrack, roving focus/keyboard controls and named word slots.
- [x] Implement validated progress restoration, visible-only elapsed time, reversible reset, post-reload Undo, first-solve record handling and preview-specific shares without stats.
- [x] Add scoped theme-aware CSS, the ten-board preview route and How to play link; integrate daily Word Paths stage behind existing gate.
- [x] Run full app tests/typecheck/lint/build; expect pass; commit `feat: add playable Word Paths preview`.

### Task 3: Browser proof and final verification

**Files:** `docs/journal.md`, `app/README.md`, this plan, screenshots under `docs/measurements/`.
**Interfaces:** Consumes the completed preview and game stage.

- [x] Start the app and inspect light/dark and phone-sized layout, pointer vertical/horizontal tracing, keyboard solving, cancellation, reload and Undo. Record actual limitations; never claim physical touch proof without it.
- [x] Run full app gates, Python suite/type/lint/format, archive replay and schema IDs; expect success and no archive diff.
- [x] Document preview and release gates, commit `docs: record Word Paths preview verification`.
- [ ] Obtain one fresh whole-branch review; address important findings with regression proof; open/attach a `feat:` PR and wait for checks; maintainer merges.
