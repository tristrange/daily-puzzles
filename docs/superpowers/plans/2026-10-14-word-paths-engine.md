# Word Paths Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove an English Wend-style board can be constructed and exhaustively checked without an AI service, before registering a new daily game.

**Architecture:** A standalone immutable grid and word-path solver enumerate legal vocabulary paths and exact covers. An experimental constructor reuses the pinned PRNG and accepts only proven unique boards. A CLI records successes, failures, timings and reviewable examples; existing rulebooks and puzzle files stay untouched.

**Tech Stack:** Existing Python 3.13, pytest/Hypothesis, ruff, pyright; standard library only.

**Spec:** `docs/superpowers/specs/2026-10-14-word-paths-design.md` (first delivery milestone only).

## Global Constraints

- English; A–Z; a committed pilot vocabulary, not all English words.
- Probe boards are 5×5, with word lengths 3, 4, 5 and 6, 18 letters and seven blockers.
- Orthogonal paths; no reused cells; every letter used once; each length used once.
- Uniqueness covers the entire vocabulary, disregarding submission order and palindrome reversal, but retaining other distinct paths.
- Work limits include path enumeration and cover search. Exhaustion is inconclusive, never a uniqueness proof.
- No app registration, published files, daily scheduling, dependencies or ScaleDown integration.
- No claim of enjoyable or logic-only puzzles; document editorial findings separately.

## Review Focus

- Two traces with the same word and occupied cells may still be distinct solutions.
- A found cover followed by budget exhaustion must not be reported as unique.
- Constructor-selected words must not narrow the solver's acceptance vocabulary.
- Blockers can create obvious word corridors; sample uniqueness does not prove play quality.
- The pilot vocabulary must remain explicitly provisional until publication freezes its contents.

### Task 1: Grid, path validation and vocabulary

**Files:** create `engine/src/queens_engine/word_paths.py`, `engine/src/queens_engine/data/word-paths-en-pilot.txt`, `engine/tests/test_word_paths.py`.

**Interfaces:** `WordGrid(width: int, height: int, letters: tuple[str | None, ...], word_lengths: tuple[int, ...])`; `WordGridError`; `spell_path(grid, cells: tuple[int, ...]) -> str`; `pilot_vocabulary() -> tuple[str, ...]`.

- [x] Write tests for legal turns, wrong totals, dimensions/cells/lengths, diagonal steps, reused/blocked/out-of-range cells and malformed vocabulary. Use literal known answers.
- [x] Run the tests; expect missing feature failures.
- [x] Implement the immutable model, direct path validation, and a curated vocabulary with provenance and explicit pilot status. Model supports small rectangular fixtures, dimensions 1–7 and distinct word lengths 3–6.
- [x] Run focused tests; expect all pass. Commit the model and vocabulary.

### Task 2: Exhaustive cover counting

**Files:** extend `word_paths.py` and `test_word_paths.py`.

**Interfaces:** `WordPath(word: str, cells: tuple[int, ...])`; `SearchBudget(max_states: int)` with `spent`/`step()`; `WordSearchLimitError`; `iter_solutions(grid, vocabulary, *, budget=None) -> Iterator[tuple[WordPath, ...]]`; `count_solutions(grid, vocabulary, *, limit=2, budget=None) -> int`.

- [x] Add failing zero/one/two-cover tests, unintended-word ambiguity, submission-order invariance, reversed palindrome equivalence and same-cells/different-path ambiguity.
- [x] Add budget regressions, including exhaustion after the first yielded cover. Add an independent tiny-board reference that enumerates letter paths directly without production helpers.
- [x] Run new tests; expect failures from missing solver behavior.
- [x] Implement vocabulary-prefix pruning and exhaustive nonoverlapping cover search. Select a remaining length, so word submission permutations cannot multiply counts. Normalize only palindrome reversal. Validate limits and vocabulary before searching.
- [x] Run focused tests and independent reference comparisons; expect agreement. Commit the solver.

### Task 3: Deterministic construction probe and delivery

**Files:** create `engine/src/queens_engine/word_paths_gen.py`, `engine/tools/benchmark_word_paths.py`, `engine/tests/test_word_paths_gen.py`, `engine/tests/test_benchmark_word_paths.py`; update engine README, journal and design; add `docs/measurements/word-paths-pilot.json`.

**Interfaces:** `generate_grid(*, seed: int, vocabulary: tuple[str, ...], budget: SearchBudget, max_attempts: int = 50) -> WordGrid`; `WordGenerationError`; benchmark `main(argv: list[str] | None = None) -> int`.

- [x] Write failing construction and CLI tests for literal board shape, reproducibility, proven uniqueness, explicit bounded failure, invalid inputs and honest failure accounting.
- [x] Run tests; expect missing-feature failures.
- [x] Implement randomized self-avoiding letter placement using `Prng`, distinct word selection by length, and full-vocabulary uniqueness checks. Budget exhaustion raises, with no fallback. This remains an experimental constructor, not a published generator version.
- [x] Implement `python -m tools.benchmark_word_paths --count 100 --out PATH`, checking each returned board with fresh unbounded enumeration and direct path/coverage checks. Report every seed, proof work, candidate counts and answer words/paths for editorial review; reports are not playable puzzle files.
- [x] Run focused tests, then the 100-seed probe and a repeat for deterministic boards. Inspect at least ten rendered examples; record misleading partial words, disconnected components and vocabulary limitations. Set no publication date or difficulty band.
- [x] Run full engine tests, pyright, ruff lint/format, schema-ID check and published-corpus replay. Existing app checks are covered by PR CI. Expect all gates pass and existing corpus bytes unchanged.
- [ ] Commit results/docs, request one independent whole-branch review, fix material findings with regression proof, open/attach the PR and wait for checks. Leave merging to the maintainer.
