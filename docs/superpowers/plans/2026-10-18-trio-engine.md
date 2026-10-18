# Trio engine feasibility implementation plan

Implement directly in the existing linked worktree, with one final independent
review. Scope: the first PR in the [design](../specs/2026-10-18-trio-design.md).

1. Add `engine/tests/test_trio.py` for grid and relation validation and actual
   completion constraints. Implement `engine/src/queens_engine/trio.py` without
   production registration. Prove zero/one/multiple solutions with bounded exact
   line-pattern search; exhaustion is inconclusive.
2. Add candidate deduction with a restriction trace. Test that a `different`
   clue leaves two alternatives and that counts, no-three and matching clues
   eliminate soundly. A stalled solve must stay distinguishable from success.
3. Add `trio_gen.py`, using the existing PRNG to construct and reduce puzzles.
   Check replay and deduction completion, then certify uniqueness with exact
   search. Keep seeded CI examples small.
4. Add `tools/trio_probe.py` to measure 20 seeds and export five samples/traces
   in `docs/measurements/trio-pilot.json`. Check recorded eliminations against
   exact counterexamples. Record bounds and human difficulty limitations.
5. Run focused tests while editing, then engine tests, pyright, ruff and published
   verification. Confirm app/schema/public files are unchanged. Review the diff,
   open and attach a PR and wait for checks; maintainer merges.

Review focus: `×` is inequality, not a binary complement; consecutive windows
include gaps but never diagonals or row wrapping; counts are three of EACH symbol;
givens cannot change; exhausted search cannot certify uniqueness. Deduction
completion does not establish human difficulty.

Execution: implemented inline. Exact search uses row/column pattern intersection
instead of sequential rows after the original approach exhausted its bound. This
is recorded in the design. No production registration or compatibility changes.
