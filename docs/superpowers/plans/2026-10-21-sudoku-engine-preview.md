# Sudoku Engine Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Produce three original, uniquely solvable Sudoku previews with independently verified Easy, Medium and Hard technique certificates.

**Architecture:** Add an isolated Sudoku model/exact counter and a separate logical deduction module. An offline preview tool constructs and verifies the three boards, exporting answer-free app data and a measurement report. The playable app is included in the same PR following the user's explicit request to play the preview now.

**Tech Stack:** Python 3.13+, existing SplitMix64 Prng, pytest, pyright and ruff. No new dependencies.

**Spec:** [Sudoku preview design](../specs/2026-10-21-sudoku-preview-design.md).

## Global Constraints

- The board has 81 row-major cells, nine rows, nine columns and nine fixed 3×3 boxes.
- Fill every cell with a digit from 1 through 9. Starting digits are immutable.
- Preview definitions have stable IDs `sudoku-preview-1` through `sudoku-preview-3`, a level label and givens.
- Rate by the weakest supported technique set that completes the original puzzle.
- Exhaustion is inconclusive, never proof of uniqueness.
- No new dependency is expected. Do not generalize Trio into a configurable puzzle framework.
- Do not add a broad seed sweep to CI. Keep production registration, schema, publisher, archives, saves and database untouched.
- Implement here, with one independent review of the completed code PR; the maintainer merges.

## Review Focus

1. Boolean/fractional/out-of-range givens must not masquerade as valid digits (Task 1).
2. A nonlocal contradiction without duplicate givens must return zero solutions (Task 1).
3. Exhaustion after finding one answer must still fail as inconclusive (Task 1).
4. Empty candidate domains or a missing digit in a unit must be contradictions, not stalls (Task 2).
5. A failed generation/certification must preserve existing artifacts; verification must never rewrite them (Task 3).

### Task 1: Pure rules and independent exact counting

**Files:** Create `engine/src/queens_engine/sudoku.py`; test `engine/tests/test_sudoku.py`.

**Interfaces:**
- `SudokuGrid(givens: tuple[int, ...])`: structural validation plus rejection of duplicate nonzero givens in any unit.
- `is_solution(grid: SudokuGrid, cells: tuple[int, ...]) -> bool`: direct rule/givens validation.
- `solve(grid: SudokuGrid, *, max_nodes: int = 200_000) -> SolveResult`.
- `SolveResult.solutions: tuple[tuple[int, ...], ...]`, `SolveResult.nodes: int`; stop at two solutions.
- `SudokuSearchLimitError`: the search did not finish its required count within budget.
- Shared `ROWS`, `COLUMNS`, `BOXES`, `UNITS`, `PEERS`: fixed, immutable geometry.

- [x] Write failing tests for 80/82 cells, bool/fractional/out-of-range values, duplicate row/column/box givens and invalid completions. A valid completed grid must preserve all givens and pass every unit; zero cells and changed givens must fail.
- [x] Add exact-count tests: a completed valid grid has one solution; an empty grid yields two; a first row `1..8,0` plus a 9 at row 2/column 9 has no solution despite no duplicate givens. A zero-node budget on an unresolved board raises `SudokuSearchLimitError`.
- [x] Run `uv run pytest -q tests/test_sudoku.py` and observe the missing behavior fail.
- [x] Implement direct validation and MRV backtracking using row/column/box occupancy. Do not call the logical solver. Count attempted placements; reject invalid budgets. Do not return a partial answer count on exhaustion, including after the first answer.
- [x] Add a bounded ambiguous-board regression that exhausts after its first answer, and assert it raises instead of claiming uniqueness.
- [x] Run the focused suite; commit `feat: add Sudoku rules and exact solution checks` after it passes.

### Task 2: Explained deductions and technique bands

**Files:** Create `engine/src/queens_engine/sudoku_deduce.py`; test `engine/tests/test_sudoku_deduce.py`; shared cases in `conformance/sudoku-preview/techniques.json`.

**Interfaces:**
- `Level = Literal['easy', 'medium', 'hard']`.
- `Step(cell, before, after, rule, group, dependencies)`: immutable candidate restriction, supporting cells and earlier step indices.
- `DeductionResult.cells`, `.candidates`, `.steps`, `.solved`: immutable tuples plus completion flag.
- `next_step(candidates: tuple[int, ...], level: Level) -> Step | None`: the rule selector used by `deduce` and the shared candidate-position fixtures. `deduce` attaches dependencies from the earlier steps supporting that restriction.
- `deduce(grid: SudokuGrid, level: Level) -> DeductionResult`; `SudokuContradictionError` for impossible candidate states.
- Candidate bits 0–8 correspond to digits 1–9; full mask is 511. Rule names: `peer`, `naked-single`, `hidden-single`, `locked-candidate`, `naked-pair`, `hidden-pair`, `naked-triple`, `hidden-triple`, `x-wing`.

- [x] Write small fixture-driven failing tests for each rule, its transpose where applicable, and near misses that must not eliminate a candidate. Shared cases contain a board/candidate position and literal expected target, removed digits and supporting unit/cells; they are data, not generated expectations.
- [x] Include zero-domain and missing-unit-digit cases that must raise; the empty board must stall without making up a placement. Run `uv run pytest -q tests/test_sudoku_deduce.py` and observe failures.
- [x] Implement deterministic candidate propagation: peer elimination and singles for Easy; add pointing/claiming and naked/hidden pairs for Medium; add naked/hidden triples and row/column X-wing for Hard. Validate rule premises before restricting masks. A completed result must pass Task 1's direct validator.
- [x] Record strict mask reductions (`after != 0`, `after` is a proper subset of `before`) and dependencies so the later browser port can explain a short chain. No exact search or contradiction trials may prove a logical step.
- [x] Run the focused tests and replay every shared case. Assert dependencies refer only to earlier steps, and masks replay to the returned state. Commit `feat: explain Sudoku deductions and classify technique bands`.

### Task 3: Construct and certify the three preview boards

**Files:** Create `engine/tools/sudoku_preview.py`, `engine/tests/test_sudoku_preview.py`, `app/src/data/sudoku-previews.json` and `docs/measurements/sudoku-preview.json`; update `docs/journal.md` and `engine/README.md` with usage/results.

**Interfaces:**
- `generate(seed: int, level: Level) -> SudokuGrid | None`: deterministic valid completed grids, shuffled clue removal, unique-solution checks and logical completion in the requested tier.
- `certify(grid: SudokuGrid, level: Level) -> dict[str, object]`: independent exact solution, finished trace, and stall under the immediately lower tier for Medium/Hard.
- `python -m tools.sudoku_preview --generate`: inspect at most 256 seeds per level; 200,000 nodes per exact check. Keep explicit per-level seed ranges and selected recipes in the report. Report failures honestly and raise if any level cannot be found.
- `python -m tools.sudoku_preview`: verify the committed three definitions and their band certificates without generating or writing.
- App JSON: only `{id, level, givens}`; IDs 1/2/3 map to Easy/Medium/Hard. Report includes recipes, rule counts, work/timing, independent answers and trace verification; reports are not imported by the app.

- [x] Write failing tests that reject mislabeled, ambiguous, unsatisfiable, malformed or duplicate-ID batches. Assert certification rejects a Medium board solved by Easy and a Hard board solved by Medium. Failed certification must leave existing output bytes intact; verify mode must not write.
- [x] Run `uv run pytest -q tests/test_sudoku_preview.py` and observe the missing behavior fail.
- [x] Implement the bounded offline tool using existing `Prng`. Validate/certify the entire batch before writing either artifact. Keep the recipe provisional; do not register Sudoku or freeze a public generator version.
- [x] Run the construction probe once; retain three accepted recipes and measurements. If a band cannot be found, report that evidence and continue tuning the bounded probe rather than weakening its certificate or borrowing an unattributed puzzle.
- [x] Add a fast committed-board test: all three have exactly one independently counted solution, their logical traces finish in the claimed tier and fail to finish in a lower tier, and every eliminated candidate contradicts the independent unique solution. Test one small deterministic construction, not the 256-seed search.
- [x] Run `uv run python -m tools.sudoku_preview`; expect three successful certificates. Run the full engine suite, pyright, ruff checks/format and published archive verification once. Run the app suite/build once because answer-free app data is added; the playable preview is included by the execution extension below.
- [x] Record timings, budgets, failures and verification limits. Commit `feat: certify three Sudoku preview levels`, request one independent review, address actionable findings, open/attach the focused PR, wait for CI, and leave merging to the maintainer.

## Playable preview execution extension

The user authorized completing both halves here instead of another merge/planning
pause. The approved spec remains the acceptance boundary.

- [x] Task 4: port pure rules, bounded independent exact checking and deductions;
  replay shared technique fixtures and verify the three boards against offline
  Python answers. Add validated, fingerprinted preview-only saves.
- [x] Task 5: add the lazy route and cell-first stage, notes/Clear notes, history,
  confirmed Reset, explained candidate hints and staged mistake warnings. Reuse
  existing controls; add Today and Rules links without production registration.
- [x] Task 6: check desktop/phone layouts, themes, keyboard completion, saved
  reload, notes/history and hint focus. Obtain one independent review; fix and
  regression-test actionable findings. Run existing gates and prepare a clean
  local production preview plus a PR. The maintainer merges.

Daily three-per-day publication remains a later rollout after playtesting.
