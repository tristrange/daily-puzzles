# Engine Test Runtime Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for this focused test refactor.

**Goal:** Reduce routine engine-test runtime by reusing expensive deterministic inputs, keeping existing assertions and seed coverage.

**Architecture:** Keep reuse inside the tests that need it. Build real inputs once, copy mutable baseline data before corruption, and keep replay calls uncached. Replace the profiled Python character loop with equivalent native string predicates.

**Tech Stack:** Existing Python, pytest and standard library; no dependencies.

**Spec:** The user's request to optimize slow GitHub checks after Trio became playable.

## Global Constraints

- Preserve puzzle recipes, published files, player state and application behavior.
- Preserve all existing correctness assertions and independent solver checks.
- Do not weaken the full archive verification or change deployment gates.
- Use a focused PR; leave broader CI redesign for a separately measured change.

## Review Focus

- A corrupted baseline must not mutate another test's input.
- Reuse must not leak across monkeypatched generators or test classes.
- Replay must still execute the real generator, independently of reused setup.
- Every registered family must still be exercised.
- Before/after timings must distinguish local measurements from GitHub timings.

## Task 1: Remove repeated setup and verify preserved coverage

**Files:** `engine/tests/test_hint_baseline.py`, `engine/tests/test_rulebook.py`, `engine/tests/test_tools.py`, `engine/tests/test_word_paths.py`, `engine/src/queens_engine/word_paths.py`.

- [x] Record baseline timings and profile the 100-seed Word Paths check.
- [x] Reuse the real hint corpus using the existing trace-baseline fixture pattern.
- [x] Share generated registry samples and reuse Star Battle generation within publishing-window tests only.
- [x] Preserve vocabulary rejection behavior while replacing the profiled character loop with built-in string predicates; keep the complete 100-seed test.
- [x] Run the same targeted tests, full engine suite, typecheck, lint and format checks.
- [x] Review the complete diff and report measured savings with the PR.

## Results

The unchanged baseline passed 648 tests in 222.63 seconds locally. The refactor passed 653 tests in 135.98 seconds (39% less time), including five new cheap rejection cases. The 100-seed Word Paths check fell from 37.37 to 21.05 seconds. Native validation took 0.105 versus 0.658 seconds for 100 full vocabulary validations; this is a manual benchmark, not a CI deadline.

All existing assertions and 100 seeds remain. The independent review found no actionable issues. Full published-archive verification remains an unchanged deployment gate. GitHub timing must be measured separately; the baseline run's tests took 9m 24s and its archive verification took 4m 51s.
