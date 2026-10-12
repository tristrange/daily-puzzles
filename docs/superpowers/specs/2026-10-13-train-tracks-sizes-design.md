# Daily Train Tracks sizes and scattered givens

## Outcome and scope

Publish three independent Train Tracks puzzles every day: **Small (8×8)**,
**Medium (10×10)**, and **Large (12×12)**. These labels describe dimensions,
not deduction difficulty. Each board has its own progress, timer and solve.
Extra given pieces should provide clues across the route rather than reveal a
continuous section from its first endpoint.

Deliver two focused implementation PRs: generation first, daily variants second.
Keep the existing puzzle rules, two mandatory edge pieces, nonzero row/column
clues, unique-solution guarantee, and browser-only storage. Do not add accounts,
dependencies, a difficulty scorer, or new puzzle types.

## Current evidence

`tracks_gen._build` reveals the first requested number of interior route cells.
Consequently every extra given extends the first endpoint; isolated clues are
currently impossible. `TrackRulebook.generate` publishes only 7×7 boards.
The underlying generator accepts other dimensions, and the schema accepts sides
up to 16 cells. There is no Train Tracks deduction engine or difficulty rating.

A preliminary probe used seeds 0, 1 and 2 with a five-second limit per seed:

| Size | Completed within the limit | Completed times |
| --- | --- | --- |
| 8×8 | 3/3 | 1.267s, 1.900s, 0.100s |
| 10×10 | 1/3 | 0.068s |
| 12×12 | 0/3 | — |

This small sample identifies a scaling risk, not a generation impossibility.
Merely increasing the publisher's dimensions would leave its runtime unbounded.

## PR 1: generation

### Scattered givens

Use generator version 3 for new puzzles. Always reveal the two endpoints first.
Order interior candidates by their distance along the solution route from the
nearest already revealed piece, selecting the farthest candidate next. Break
ties by route position. This gives a deterministic ordering without additional
random draws and exposes the middle of long unknown sections first.

Only select a candidate with at least one unrevealed route cell between it and
every existing given. Retain the current cap of roughly one third of interior
route cells. If the route cannot become unique within that cap and separation
rule, reject it and try another route. Spatial neighbours may still be near
each other when the route doubles back; the guarantee concerns connected runs
of revealed track, not arbitrary visual distance.

Try the endpoints alone, then reveal candidates incrementally. Return a board
only after an exhaustive uniqueness check proves exactly one solution. Keep
the nonzero-clue filter before that search.

### Bounded uniqueness search

Add deterministic search-node limits for generation. A limit counts visited
search states, not elapsed time. Exhaustion is an explicit incomplete search,
never evidence of uniqueness or of zero solutions. Because generation already
knows a legal solution, an incomplete check may move to the next clue candidate;
exhausting the per-seed budget raises the existing generation failure so the
publisher can advance the seed.

Use initial version-3 limits of 25,000 search states per uniqueness check and
250,000 across one seed. Measure these during implementation; any adjustment
must be recorded in the PR and frozen before version 3 is published. Existing
solver callers retain their exhaustive behavior unless they explicitly request
a limit. Do not introduce a replacement solver unless measurements show the
bounded existing search cannot meet the acceptance gates below.

Replay versions 1 and 2 with their existing prefix placement and policies.
Version 1 still permits zero clues; version 2 still requires nonzero clues.
Neither legacy replay path uses the new generation budgets. Version 3 replays
with its frozen placement and budgets. Unsupported versions fail explicitly.
Do not rewrite published files, including files generated ahead of their dates.

## PR 2: three daily variants

### Identity and compatibility

Retain `train-tracks` as the puzzle type. Use separate file stems:

- `YYYY-MM-DD-tracks-small` — 8×8
- `YYYY-MM-DD-tracks-medium` — 10×10
- `YYYY-MM-DD-tracks-large` — 12×12

Continue accepting `YYYY-MM-DD-tracks` for historical 7×7 puzzles. New files
keep the existing envelope and board dimensions; do not add a difficulty or
redundant size field. For sized IDs, both parsers must verify that the type and
dimensions match the named variant. Legacy dimensions remain valid as before.

Extend the existing ID helpers, conformance manifest and generated schema
pattern together. Keep variants separate from the family registry so all three
use the same rules, renderer and statistics category.

### Publishing and rollout

Choose and pin one activation day in the shared ID conformance manifest during
PR 2. It must follow the latest committed legacy Train Tracks date, including
prepublished future files. Both languages read the same transition rule.
Before activation, a complete day requires the existing legacy slot. From
activation onward, it requires all three sized slots. A partial run resumes at
the missing variant without replacing any existing file.

Derive each variant's seed from its full ID, using the existing deterministic
seed hashing convention. Generate its prescribed dimensions with version 3.
Keep seed retries bounded. Failure must not silently substitute a smaller board,
weaken nonzero clues, or publish an unproven puzzle. Preserve the existing
verification, hint-baseline regeneration, and deployment workflow.

Include a validated initial batch of all three variants in PR 2, covering the
activation day and the following three days, matching the publisher's lead
length. Do not
backfill sized variants into older archive dates.

### Player interface

Keep one Train Tracks card on Today with three clearly labelled play actions:
Small · 8×8, Medium · 10×10, and Large · 12×12. Show each variant's solved or
unpublished state independently. Before activation, show the existing daily
card. Use links to separate puzzle pages, avoiding a selector that can discard
an in-progress board.

Show the size label beside dimensions on the puzzle page and in Train Tracks
archive entries. Keep archive dates grouped under Train Tracks; historical 7×7
entries display their dimensions without inventing a Small label. Include the
size in share text and recent-solve labels. Storage keys and first-solve handling
remain keyed by full puzzle ID, keeping the three solves independent. All
variants contribute to the existing Train Tracks statistics category.

Preserve Auto/system, Light and Dark appearance behavior. Verify 12×12 on a
320px viewport: it must not overflow horizontally, and the picker retains
44px controls. Small board cells are an inherent tradeoff of showing 12×12 on
a phone; document the measured cell size and check pointer and keyboard play.

## Acceptance and verification

For PR 1:

- Pin legacy version-1 and version-2 replay fixtures and verify all published
  puzzles without changing their files.
- Test deterministic replay, nonzero clues, mandatory endpoints, separated
  givens, valid routes, and unique solutions at the three requested dimensions.
- Test search-limit exhaustion and retry behavior, including that an incomplete
  uniqueness check cannot publish a board. Test unchanged exhaustive counting.
- Benchmark 100 consecutive seeds per size with a ten-second measurement limit
  per seed. At least 95% must finish within the limit; report median, maximum,
  failed seeds and given counts. Validate every returned board independently.

For PR 2:

- Add shared valid/invalid ID cases, including dates, variant names, wrong
  dimensions, and legacy IDs. Run both language suites and the schema check.
- Test complete and partially published days on each side of activation,
  idempotent publishing, independent progress/solves, and legacy archive loading.
- Generate and verify ten consecutive days of all three variants in a temporary
  directory. Each day's three boards must complete within 60 seconds on the
  measured machine; retain failure reporting instead of claiming a guarantee.
- Verify Today, archive, share labels and puzzle pages in both appearances and
  at desktop and phone widths. Run app tests, production build, engine tests,
  lint/type checks, puzzle verification and the existing conformance gates.

If generation misses these gates, pause expansion of the publishing schedule
and report the measured blocker. Do not relax puzzle correctness to meet timing.

## Recovery

PR 1 leaves daily publishing at 7×7, so generator behavior is independently
reviewable. PR 2 activates the new slots only with valid content already present.
After activation, recovery must retain readers for the new IDs and generator
version: reverting to software that cannot read published variants is unsafe.
If publishing needs to stop, disable future writes while preserving archived
files, parsers and replay implementations.
