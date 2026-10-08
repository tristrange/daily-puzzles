# Journal

What was tried, what the measurements said, and the bugs that were found rather than
avoided. The reasoning is the point; the shipped code is in `git log`.

## Milestones

| # | Milestone | Status |
| --- | --- | --- |
| 1 | Scaffold both toolchains, shared schema, conformance fixtures | done |
| 2 | Solution counter — exact, parameterised by region capacity | done |
| 3 | Seeded generator, uniqueness gate, replay, ASCII renderer | done |
| 4 | Deduction engine and difficulty score (timeboxed, cuttable) | done |
| 5 | React shell, `puzzleOfToday(date, tz)`, archive routes | done |
| 6 | Board UI, keyboard and screen reader support, hint engine | done |
| 7 | Game loop: undo, timer, win detection, auto-mark | done |
| 8 | Daily pipeline: cron generates, commits, CI re-verifies every puzzle | done |
| 9 | Stretch: share text, local stats, dark mode | done |
| 10 | Stretch: Star Battle as a second puzzle type | done |
| 11 | Both puzzles every day: a Star Battle companion per date, and the format work to carry it | done |
| 12 | A landing page that offers both of today's puzzles instead of assuming one | done |
| 13 | A How to play page, and the region star counts it needs to be able to point at | done |
| 14 | Remember the auto-mark choice between visits | done |
| 15 | A weekly difficulty ramp for Queens, and the band in the puzzle file | done |
| 16 | Port the deduction engine to per-group counts so Star Battle can be rated, then ramp it too | open |

Milestones 2 to 4 were the critical path, and they are all Python. The engine alone — a
CLI with an exact uniqueness prover and property tests — would have been worth publishing
even if the app half slipped.

## A rule that looked right and was degenerate

Regions are required to be 4-connected, and that is the whole of the rule. An earlier
version also required that a region never touch *itself* diagonally, reasoning that this
made the blob boundaries unambiguous. It does not: a 4-connected set with no diagonal
self-contact is necessarily a straight line, because any path that turns at `p -> q -> r`
leaves `p` and `r` diagonally adjacent.

Enumerating every legal region of a 3×3 under that rule yields **27 shapes, none of them
two-dimensional.** The check would have quietly reduced every puzzle to parallel stripes
while passing every test written against stripes — which is the shape of the failure worth
remembering: not a wrong answer, but a rule so narrow that it only ever saw its own
assumption.

## The second puzzle type

Star Battle shares nearly everything with Queens, and the design paid off in
exactly the places the README claimed it would. The rules change from *one*
star per row, column and region to *k*; everything else — no two stars touching,
`size` regions, unique solution, the whole file format — is identical. The
solver was already capacity-parameterised, `Board` already carried a
`region_capacity`, the schema already required `regionCapacity` for
`type: "star-battle"`, and both parsers already defaulted it. The generator was
the last Queens-only piece.

So the real cost of adding a puzzle type was not the engine, it was the honest
inventory of what is *not* general. The deduction engine modelled "this line has
one candidate left" with boolean flags and wiped a region when a queen landed —
all single-star thinking. Rather than half-generalise it, Star Battle first
shipped with the guarantee it could actually back: a **unique** solution, but
neither logic-gated nor difficulty-scored (`deduce` refused the board outright,
and the CLI said so).

That inventory has since been paid off. The engine now carries a *count* per
group instead of a flag, so one code path covers one star and k: a group is
finished when its need reaches zero, and a group is short when it has fewer free
cells than stars still owed. The last piece was `fill` — a group with exactly as
many candidates as stars left, which is a single star at k = 1 and a naked
pair at k = 2. Queens is provably untouched by it, and all 48 recorded
Queens traces stay byte-identical; Star Battle uses it ten times on the rare
board that finishes.

The measurements, rather than the argument, decided what ships. The rules work on
a two-star board and are sound there, but a two-star board almost never finishes
without guessing: over 1000 generated 8x8 boards, 92% offer an opening
deduction and **0.1%** complete by rules alone, against 100% for Queens. So
`--logic-only` and the weekly ramp stay Queens-only, and the reason is recorded
here rather than left as "not implemented yet". Making Star Battle logic-gated
would mean changing the boards — the genre's difficulty lives in the shapes a
generator can rarely be talked into — which is a design decision, not a bug fix.

The daily star board is 9x9 rather than 8x8 for a related reason: at 8x8 with
two stars per row the row patterns collapse to two mirror images, so the board
gave itself away after a star or two, while 9x9 leaves 664 arrangements to
solve. The size is pinned in the rulebook rather than ramped, and a published
star board also refuses to repeat a solution layout published within two weeks
on either side of it — the generator is stars-first, so an unrelated seed can
land on the same arrangement, and boards close together that shared one would be
playable from memory, recreating the degeneracy the 9x9 size just removed. The
same window is enforced on committed files by `tools.verify`, so a duplicate
cannot slip into the archive through any path (again, among boards of the
current published size — the pre-9x9 archive predates the rule).

## Playing a star

The app side turned out to be smaller than the engine side, because the puzzle
*type* was never the thing the game loop assumed — the *rules* were. Every
player-facing rule was phrased as "one per row, column, region", so the fix was
to read the number off the board instead of hard-coding it:
`starsPerRow(board) = sum(regionCapacity) / size`, which is 1 for Queens and k
for Star Battle. Conflict detection then asks the right question per group: not
"do these two share a row?" but "is this row over capacity?". A shared group is
only a conflict once it holds more than its share, so two stars in one k-star
region are exactly what the region asked for, while three are not. Precedence
(row > column > region > touch) is unchanged, and it falls through rather than
returning early, so a pair that shares a row *within* capacity but still touches
is reported as touching instead of being waved through. The win condition falls
out of the same number: `size * starsPerRow` pieces with no conflicts fills
every group exactly, so there is no separate per-type win check.

Auto-mark is the one place the honest answer is less than the exhaustive one. A
queen does rule out its whole row, column and region, which is why
`cellsEliminated` can reproduce the hint engine's elimination set exactly. A star
does not: its row, column and region may still hold more stars, and whether a
cell survives depends on the *rest* of the player's stars, not on this one. So
auto-marking a star marks only the eight touching cells. That is a deliberate
under-mark, never a wrong mark — the alternative is recomputing the whole board
on every click, and silently marking a cell the player can still legally use is
worse than leaving it unmarked.

The hint engine stayed single-star on purpose, and the app follows it rather
than papering over it: `firstHint` returns `null` for a Star Battle board and
the Hint button is not rendered. A hint engine that reasons in one star and
speaks in two produces confident nonsense, and `null` is the only honest answer
until the rules are ported.

The gap this left was editorial, not technical, and it is now closed by a
decision rather than by a rule: **every day carries both puzzles**, so there is
no schedule to keep and no day that silently falls back to Queens. Each is its own
game with its own solve — Queens and Star Battle, one id each — and the archive lists
both under their shared date.

That decision forced the one genuinely awkward change in the format. Two puzzles a day
cannot both be identified by a date, so the companion's id carries a `-star` suffix, in
the filename, the file's `id` and the URL alike. The suffix is not decoration: a solve is
recorded against an id and first-solve-wins, so had both puzzles of a day shared the bare
date, solving Queens would have made the day's Star Battle permanently unrecordable.
Suffixing keeps the archive's existing keying, needs no migration for history already
stored, and leaves one honest invariant — **the bare date is the Queens puzzle and
`-star` is the companion** — which is why the one Star Battle board that predates
companions, 2026-09-26, was moved into the companion slot and given the Queens board its
date had been missing.
