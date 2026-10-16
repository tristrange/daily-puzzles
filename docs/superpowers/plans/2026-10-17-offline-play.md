# Offline Play Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement inline, task-by-task.

**Goal:** Reopen the app and play previously fetched puzzles offline.
**Architecture:** Versioned app-shell worker; validated puzzle fallback in the existing loader; small status/error copy changes.
**Tech Stack:** Existing React/Vite/Vitest and browser Cache/Service Worker APIs, no dependencies.
**Spec:** docs/superpowers/specs/2026-10-17-offline-play-design.md

## Global Constraints

- Preserve game rules, themes, progress formats, statistics and gestures.
- Support `/` and `/daily-puzzles/`; cache namespaces must include the base path.
- No forced reload/skipWaiting, background archive download or new dependencies.
- Queens/Star Battle reload behavior stays unchanged; this caches puzzles, not new player-state formats.

## Review Focus

- A new build cannot replace an active puzzle or mix HTML with another build’s lazy chunks.
- Cleanup must leave puzzle downloads, player progress and neighboring apps untouched.
- Invalid network/cache content must not become a playable puzzle or overwrite a valid download.
- Missing/blocked storage must not break online play or falsely promise downloaded boards.
- Normal browser and installed-app paths must work after the local server stops.

## Task 1 — Validated puzzle downloads

**Files:** app/src/lib/puzzles.ts, app/src/lib/puzzleOffline.test.ts, loader/render tests and unavailable messages.
**Produces:** existing loader returns validated saved boards on failure; `PuzzleUnavailableError` and optional probe `unavailable` flag distinguish transport misses.
- [x] Write and run failing tests for all four families, fresh precedence, invalid/mismatched responses and cache entries, storage failure and mixed probes.
- [x] Add minimal loader-owned response caching and clear missing-download messages; preserve ordinary 404 behavior.
- [x] Run app suite/type check, then commit. Expected: all pass.

## Task 2 — Versioned app shell

**Files:** app/build/offline.ts, app/offline/sw.js, app/vite.config.ts, app/src/components/OfflineStatus.tsx, Shell.tsx and focused worker/build tests.
**Consumes:** Task1 owns puzzle data; worker must not intercept puzzle fetches.
**Produces:** build emits sw.js; registration and status reside in OfflineStatus; precache includes lazy chunks and static shell files.
- [ ] Write/run failing worker/build tests for both bases, failed install, cleanup scope, GET-only routing, lazy files and worker-only version changes.
- [ ] Implement build plugin and worker with waiting updates; add readiness/offline status and help copy.
- [ ] Run app tests, types/lint and root/project-path builds; commit. Expected: all pass, worker contains every emitted code asset.

## Task 3 — Browser proof and delivery

**Files:** README/app README, journal, screenshots, plan completion.
- [ ] Test online loading, stop only the temporary server, reload app and a cached Word Paths board, submit/undo a word, visit archive and uncached puzzle.
- [ ] Restart server and verify recovery; record actual results and physical-device limits.
- [ ] Run final gates and one fresh-context review, resolve important findings with a failing test first, update PR and wait for exact-head CI. Never merge.
