# Daily Sudoku

The maintainer has playtested standard Sudoku and authorized daily release after
merging the preview controls. Publish Easy, Medium and Hard every day, reusing the
existing daily pipeline and Sudoku stage. No new game rules, dependencies or
paid services. Preserve all six existing families, preview progress and scores.

## Contract and publication

Activation is 2026-10-21. Required IDs are `YYYY-MM-DD-sudoku-easy`,
`YYYY-MM-DD-sudoku-medium` and `YYYY-MM-DD-sudoku-hard`. There is no unsized
Sudoku slot. Add `sudoku` to the shared ID manifest and production schema.
The envelope uses generatorVersion 1 and no numeric `difficulty`; its board is
`{size: 9, level: "easy" | "medium" | "hard", givens: [81 digits]}`. Its level
must match its ID. Ship only givens; no answers or logical traces in runtime data.

Move the preview's seeded generation recipe into the engine, preserving preview
reproducibility. Bound attempts and exact search; require one solution, logical
completion under the requested level, and a stall under the preceding level for
Medium/Hard. Exhaustion fails honestly, never downgrades a slot. Replay uses the
stored seed/version/level. Commit today's slots and the normal three-day buffer;
do not rewrite existing archive files or add a CI seed sweep.

## App integration

Reuse SudokuStage for previews and daily puzzles. Daily progress has a separate
storage namespace and ID/fingerprint validation. Preview IDs and save formats
remain supported. Daily completion uses SolvedPanel, first-solve Stats, sharing
and optional leaderboard submission; replays preserve the first result.
Every level is a separate puzzle, while streaks still count calendar days once.
Keep the focused-play timer, hints and all merged note/selection controls.

Today groups three compact level choices in one Sudoku card. Archive, Stats and
Leaderboards identify each level and route to its exact puzzle. Saved offline
loading follows existing daily puzzle caching. Keep previews accessible without
advertising Sudoku as preview-only. Keep the playable stage lazy loaded.

## Database and rollout

An additive, retryable migration expands permitted families, ID patterns and
level-label/dimension checks to Sudoku while preserving existing rows, security policies, grants and RPC
signatures. Catalog metadata uses 9x9 and size_label Easy/Medium/Hard. Verify clean
install and upgrades, including existing scores and permissions. The maintainer
applies the migration before merging the daily rollout PR. Existing code remains
compatible with the expanded database; rollback withdraws the app release without
deleting new rows or shrinking database constraints.

## Acceptance

Focused tests cover cross-language IDs/schema, level mismatch rejection,
deterministic generation/replay and certificates, slot activation/resumption,
preview/save isolation, daily first solves/shares/leaderboard offering, and level
navigation. Run existing app/engine/database gates once integration is complete,
replay the published archive, and browser-check Today, daily play, saved reload,
hints, completion and narrow/dark layouts. Obtain an independent final review.
Physical iPhone checks remain a maintainer playtest; do not claim production
deployment until the migration, merge and deployment actually happen.
