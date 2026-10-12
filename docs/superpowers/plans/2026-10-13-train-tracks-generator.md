# Train Tracks Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver PR 1: scattered, separated givens and bounded deterministic generation that can reliably produce 8×8, 10×10 and 12×12 Train Tracks boards.

**Architecture:** Extend the existing exhaustive solver with opt-in search budgets. Generator version 3 uses these budgets and deterministic scattered clue ordering; versions 1 and 2 retain their existing behavior. Daily publishing stays at 7×7 until the separate daily-variants PR.

**Tech Stack:** Python 3.13+, pytest, existing reference solver tests, ruff and pyright. No new dependencies.

**Spec:** [Approved design](../specs/2026-10-13-train-tracks-sizes-design.md), specifically PR 1 and its acceptance gates. PR 2 requires its own plan after the measured generator results; this plan does not change puzzle IDs or the app.

## Global Constraints

- New puzzles use generator version 3; versions 1 and 2 remain replayable with prefix givens and their respective zero-clue policies.
- Both edge pieces remain mandatory; every newly generated row and column clue is at least 1; only proven unique boards may be returned.
- Extra givens are separated along the route by at least one unrevealed cell; retain the current interior-clue cap and whole-set `max_givens` semantics.
- Start with 25,000 visited search states per uniqueness check and 250,000 across one seed. Record and freeze any measured adjustment before publishing version 3.
- Search limits are deterministic state counts, never wall-clock decisions. Existing callers remain exhaustive by default.
- Preserve all published puzzle files, including prepublished future files. No accounts, dependencies, difficulty scorer or new puzzle types.
- Benchmark 100 consecutive seeds at each of 8×8, 10×10 and 12×12, with a ten-second measurement limit per seed and at least 95% completion per size.

## Review Focus

- A search that finds one solution and then exhausts its budget must report incomplete search, never uniqueness (Task 1).
- Exhaustion must not corrupt a later search or reuse mutable state from an abandoned branch (Task 1).
- A tight given cap or very short route must reject unsuitable routes without silently revealing adjacent pieces or extra clues (Task 2).
- Changing the current generator version must not route old puzzle replay through new placement or budgets (Task 2).
- Slow, failed and timed-out benchmark seeds must remain visible in reports instead of disappearing from the success denominator (Task 3).

## Files and responsibilities

| File | Responsibility |
| --- | --- |
| `engine/src/queens_engine/tracks.py` | Opt-in search-state budgets and a distinct exhaustion exception. |
| `engine/src/queens_engine/tracks_gen.py` | Versioned clue placement and bounded version-3 generation. |
| `engine/src/queens_engine/rulebook.py` | Generate version 3; select explicit replay policies for versions 1–3. |
| `engine/tests/test_tracks.py` | Budget semantics and unchanged reference-solver agreement. |
| `engine/tests/test_tracks_gen.py` | Separation, dimensions, generation exhaustion, uniqueness and replay pins. |
| `engine/tests/test_rulebook.py` | Serialized versions, replay routing and publisher-compatible errors. |
| `engine/tests/fixtures/tracks-v2-seed7.json` | Full pre-change version-2 replay fixture, captured before implementation. |
| `engine/tools/benchmark_tracks.py` | Reproducible bounded seed probe and independent validation. |
| `engine/tests/test_benchmark_tracks.py` | Benchmark outcome accounting and timeout/error handling. |
| `docs/journal.md` | Measured results, final budgets and limitations. |

### Task 1: Add opt-in solver budgets

**Interfaces:**
- Produce `TrackSearchLimit(RuntimeError)` for an incomplete bounded search.
- Produce `SearchBudget(max_states: int)` with read-only `spent` and `remaining` counts; reject negative limits. Zero permits no visited states.
- Extend `iter_solutions(grid: TrackGrid, *, max_states: int | None = None, budget: SearchBudget | None = None) -> Iterator[Assignment]`.
- Extend `count_solutions(grid: TrackGrid, *, limit: int = DEFAULT_LIMIT, max_states: int | None = None, budget: SearchBudget | None = None) -> int`.
- One visited state is an entry to `_walk`, including a complete assignment. Each query has fresh solver state; a caller may reuse only the aggregate budget.

- [ ] **Write failing budget tests** in `engine/tests/test_tracks.py`: zero budget raises `TrackSearchLimit`; a generous bounded count equals exhaustive counting; negative limits raise `TrackGridError`; a shared budget never overspends across two searches; a fresh exhaustive search after exhaustion still returns the reference answers.
- [ ] **Add the partial-result regression:** use the existing ambiguous 4×4 fixture in `TestKnownAnswers.test_a_grid_with_two_routes_has_both`. Advance a generously bounded iterator to its first solution and record `budget.spent`; counting with exactly that many allowed states and `limit=2` must raise rather than return 1.
- [ ] **Run the tests red:** from `engine`, `./.venv/bin/python -m pytest tests/test_tracks.py -q`. New tests must fail because budget support is absent; existing tests remain green.
- [ ] **Implement the interfaces** in `tracks.py`. Check both limits before entering a state; propagate `TrackSearchLimit` unchanged. Avoid state-budget work on the existing unbounded path where possible. Retain candidate ordering and solver rules.
- [ ] **Run the tests green**, including the existing tiny-board independent reference cases. Do not replace the reference with the production solver.
- [ ] **Commit:** `feat(engine): bound optional Train Tracks search by visited states`.

### Task 2: Introduce scattered generator version 3

**Interfaces:**
- Consume Task 1's solver interfaces and exception.
- Add `generator_version: int = 3` to `generate_grid`, retaining `seed`, `width`, `height`, `max_givens`, and `require_nonzero_clues` parameters. Versions 1 and 2 select legacy prefix construction; version 3 selects scattered construction and budgets. Reject unknown versions and reject `require_nonzero_clues=False` for version 3. The rulebook supplies the appropriate nonzero policy explicitly for legacy replay; update legacy test calls to name their generator version.
- Add `_scattered_positions(route: list[int]) -> list[int]`, returning route positions, excluding endpoints and every position adjacent along the route to an already selected given. Choose greatest minimum distance to selected positions; break ties toward the lower route position.
- Retain `_build` as the legacy builder. Add `_build_scattered(width: int, height: int, pieces: list[int], route: list[int], positions: list[int]) -> TrackGrid`; reuse row/column counting without changing legacy output.
- Set `TRACKS_GENERATOR_VERSION = 3`; daily width and height remain 7. Replay 1, 2 and 3 through explicit branches independent of the current-version constant.

- [ ] **Capture the version-2 fixture before changing generation:** serialize the current rulebook's seed-7 puzzle with ID `2026-10-16-tracks` into `engine/tests/fixtures/tracks-v2-seed7.json`. Pin its complete content in a fixture replay test, not just dimensions or a comparison of two fresh draws.
- [ ] **Write failing placement tests:** for `route=list(range(11))`, the first two scattered positions are `[5, 2]`; all selected positions exclude 0 and 10 and differ by at least 2. A three-cell route has no eligible interior given. Pin repeat ordering and a doubling-back route to distinguish route separation from arbitrary geometric distance.
- [ ] **Write failing generation tests:** parameterize 8×8, 10×10 and 12×12; prove nonzero clues, two off-grid given ends, a valid unique solution and no connected pair of given pieces. Use existing `obeys` for independent assignment validation. Pin a complete successful version-3 replay fixture after its policy is implemented.
- [ ] **Write failing failure-path tests:** force per-check exhaustion and verify that generation tries another clue; force aggregate exhaustion and verify `TrackGenerationError`; force every check to remain incomplete and verify no grid is returned. Verify route rejection when the separation rule prevents another given. Retain the cap-below-two and whole-set-cap tests.
- [ ] **Update rulebook tests:** new serialized puzzles declare version 3; the captured version-2 fixture and existing version-1 archived puzzle replay unchanged even if the current-version constant is monkeypatched to 4. Unsupported versions still fail, and generation exhaustion is translated to `GenerationError` for publisher seed retries.
- [ ] **Run the new tests red:** `./.venv/bin/python -m pytest tests/test_tracks_gen.py tests/test_rulebook.py -q`.
- [ ] **Implement version 3** in `tracks_gen.py` and explicit replay branches in `rulebook.py`. Use one aggregate `SearchBudget(250_000)` per seed and `max_states=25_000` per check. Catch per-check exhaustion to add a clue only while aggregate budget remains. Never catch it as a successful count. Reuse the existing route retries and given cap.
- [ ] **Run focused tests green** and `./.venv/bin/python -m tools.verify --dir ../app/public/puzzles`. Preserve corpus bytes; do not regenerate published puzzles or the hint baseline to conceal replay drift.
- [ ] **Commit:** `feat(engine): scatter Train Tracks clues in generator version three`.

### Task 3: Measure and prove the larger sizes

**Interfaces:**
- Add `tools.benchmark_tracks.main(argv: list[str] | None = None) -> int` with `--sizes` (default `8 10 12`), `--count` (default `100`), `--start-seed` (default `0`), `--timeout` (default `10` seconds), and optional `--out` JSON path.
- Run each seed in a separate process so the measurement deadline can stop a stalled solver without affecting generation policy. Record size, seed, generation seconds, given count and one outcome: `ok`, `generation-error`, `timeout`, or `validation-error`.
- Independently validate every generated board with an unbounded solution enumeration stopping at two and a direct check of row/column counts, reciprocity, endpoints, givens and single-path connectivity. Keep validation outcomes distinct from generation timings.
- Summaries include all attempted seeds, success fraction, median/maximum successful generation times, failed seed IDs and given-count range. Return nonzero if any size misses 95% completion, or any returned board fails validation.

- [ ] **Write failing benchmark tests** in `engine/tests/test_benchmark_tracks.py`: scripted success, generation failure and timeout all count toward attempted seeds; validation failure cannot be reported as `ok`; a 94/100 summary fails and 95/100 passes; reject nonpositive counts/timeouts and unsupported requested dimensions.
- [ ] **Run the tests red:** `./.venv/bin/python -m pytest tests/test_benchmark_tracks.py -q`.
- [ ] **Implement the tool** using standard-library subprocess, JSON, timing and statistics modules. Bound worker cleanup and retain partial results if interrupted. Do not add infrastructure or external dependencies.
- [ ] **Run tests green**, then run the default 300-seed probe. Independently validate every successful board; record machine/runtime details and the full JSON results in a temporary file for inspection.
- [ ] **Evaluate the gate:** if any size misses 95%, inspect measured failures and tune the version-3 budgets within this PR, rerunning affected tests and the full probe after tuning. Record the final values in the design and journal. If bounded existing search still misses the gate, stop publication expansion and report evidence; do not quietly add adjacent givens or remove uniqueness checks.
- [ ] **Run final required checks** from `engine`: `./.venv/bin/python -m pytest -q`, `./.venv/bin/pyright`, `./.venv/bin/ruff check .`, `./.venv/bin/ruff format --check .`, `./.venv/bin/python -m tools.verify --dir ../app/public/puzzles`, and `./.venv/bin/python -m tools.schema_ids --check`. From `app`, run `npm test` and `npm run build` to confirm corpus consumers still work.
- [ ] **Document measured results** in `docs/journal.md`, including final budgets, sample failure rates, given counts and the unchanged 7×7 publishing schedule. Update the benchmark's usage documentation in its module docstring.
- [ ] **Commit:** `test(engine): measure larger Train Tracks generation`.
- [ ] **Request one independent whole-branch review**, fix actionable findings and rerun relevant checks. Open and attach PR 1 with the measured results and legacy-replay proof; wait for its checks and leave merging to the user. Do not activate the three daily variants in this PR.

## PR 2 handoff

After PR 1 meets its gates, use its final frozen version-3 policy to write the
separate daily-variants plan against the approved design. That plan must cover
the shared activation day, three IDs per day, schema and cross-language ID
conformance, initial content batch, publisher recovery, independent progress and
solves, size labels, and mobile appearance/play checks. PR 1 does not satisfy
those user-facing requirements by itself.
