# Trio: three-symbol logic puzzle

## Agreed direction

Build an original Tango-inspired variant with sun, moon and star, initially 9×9.
Every row and column contains three of each symbol. No three consecutive cells
may contain the same symbol horizontally or vertically. An `=` between adjacent
cells requires the same symbol; `×` requires different symbols. With three symbols,
`×` leaves two alternatives. There are no diagonal or distinct-row rules. Givens
are immutable. All constraints must hold simultaneously to finish.

Use consistent amber sun, blue crescent and purple five-point star icons; shape
must distinguish symbols without colour. Keep short sun rays distinct from the
star at phone cell sizes. Trio is a working title, not a published game yet.
The user approved this direction and asked to begin; continue in small PRs
without repeated process approvals.

## First PR: engine feasibility

Follow the Word Paths prototype boundary: add an isolated Python model, direct
completion validator, two-solution counter, deterministic construction probe,
and deduction solver. Do not register an incomplete family in the production
schema, scheduler, app registry or public puzzle files. No new dependencies.

The model fixes 81 row-major cells: 0 empty, 1 sun, 2 moon, 3 star. Relations use
ordered, orthogonally adjacent indices and `same` / `different`; duplicates and
malformed values are rejected. Contradictory but structurally valid givens are
legal solver inputs and must yield no solutions, never a false unique result.

Deduction starts with three candidates per empty cell. Apply row/column counts,
no-three windows and relation propagation until stable. Record each candidate
restriction with its rule and affected group. A stalled trace is not a successful
logic solve. No guesses or contradiction trials are used in this trace.

Independently enumerate balanced, no-three line patterns for exact search. Filter
rows and columns by givens and their relations, intersect candidates at crossings,
then branch on the smallest remaining pattern domain. Count up to two solutions.
Bound candidate-line branches and raise on exhaustion. Inconclusive
search cannot certify uniqueness. Keep exact search separate from deduction.
Validate completed assignments directly as a further check.

Generate a valid solution using seeded line-pattern search and the existing SplitMix64.
Initially choose 24 adjacent relations from that solution, then remove givens
only when deductions still finish the board. Remove redundant relations under
the same condition. Independently prove exactly one solution before accepting.
This is a provisional probe recipe, not a frozen daily generator version.

Measure 20 seeds: success, timing, givens, relation mix, deduction kinds and search
work. Store five sample boards and traces for later preview work. Cross-check
sample eliminations against exact counterexamples. Do not infer human difficulty
from size, clue count or trace length; playtesting is required. Exhaustion fails
explicitly, without changing rules or board size.

## Next PRs

1. Freeze a measured recipe and integrate the shared file/ID contract, TypeScript
   validation and conformance fixtures. Keep publication gated off.
2. Add a playable preview using existing timer, undo/reset, local progress and
   theme patterns. Provide a three-symbol picker, tap/drag and keyboard access,
   relation clues and phone-sized icons. Preview solves do not affect daily stats.
3. Playtest, then add daily publishing and archive/stats integration. Choose any
   difficulty policy from observed deductions and player experience.

## Verification and limits

Use focused behavioural tests for rule violations, zero/one/multiple solutions,
search exhaustion, deduction soundness and deterministic generation. Run engine
gates and existing published-puzzle verification once locally; CI is unchanged.
Do not add a large seeded batch to each CI run. No UI, schema, saved data,
account features, hints or daily rollout in the first PR.

## Implementation finding

Sequential row search exhausted its bound even on some deduction-solvable boards.
Row/column pattern intersection and smallest-domain branching replaced it while
keeping exact search independent of the candidate-rule solver. The search budget
counts attempted line branches; fixed-size pattern filtering is finite separately.
Construction tries at most ten bounded searches. This changes the provisional
recipe only; no public generator version or published content is affected.
