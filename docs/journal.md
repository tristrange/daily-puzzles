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
| 16 | Port the deduction engine to per-group counts so Star Battle can be rated, then ramp it too | done — rating deferred, below |
| 17 | Train Tracks: a per-type contract the model was missing, and the type registered against it | done — engine and app, unpublished |

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

## Why Star Battle carries no difficulty band

Milestone 16 asked for Star Battle to be rated and then ramped, and the port that
made either possible is done: the engine carries a *count* per group rather than a
flag, so one code path covers one star and k, and the app's hint engine was ported to
match (#52). What is left is a product decision, and the measurement says not yet.

Scoring 25 generated 9x9 two-star boards — seeds 0 to 24, a bare range rather than a
sample, so the set is the first 25 and nothing is picked:

| | result |
| --- | --- |
| bands awarded | 24 Nightmare, 1 Expert |
| boards that needed a hypothesis | 25 of 25 |

Reproduce it from `engine/`. The seeds are fixed, so the numbers should match exactly; if
they do not, the scorer has moved and this section is stale.

```sh
PYTHONPATH=src .venv/bin/python - <<'EOF'
from collections import Counter
from queens_engine import GenerationConfig, PuzzleType, generate_puzzle, score_difficulty

bands, guessing = Counter(), 0
for seed in range(25):
    puzzle = generate_puzzle(
        seed=seed,
        puzzle_id="measurement",
        config=GenerationConfig(size=9, puzzle_type=PuzzleType.STAR_BATTLE, stars_per_row=2),
    )
    scored = score_difficulty(puzzle.board)
    bands[scored.level_name] += 1
    guessing += scored.needs_guessing

print(f"bands: {dict(bands)}  needs_guessing: {guessing}/25")
EOF
```

Deliberately not a test. A test would turn "the scorer changed" into a red build, and
changing the scorer is precisely what fixing this needs; that check belongs to whoever
makes the change, not to CI.

The score is a weighted count of deduction firings, so a board holding 18 pieces does
roughly twice the work of a 9x9 Queens board holding 9, and saturates the top band
wherever it lands. It measures *work*, not hardness. Recalibrating the bands per genre
would not rescue it: with almost no spread in the distribution, any table would call
nearly every board the same thing, which is not a difficulty signal but a constant with
a label.

What the number mostly reports is whether the engine had to guess, and on a two-star
board that is a property of the genre rather than of the puzzle — 0.1% of 8x8 two-star
boards finish on rules alone, and none of these 9x9 boards did. So the honest position
is the current one: Star Battle is unique-solution and unscored, a star file carries no
`difficulty`, and the chooser card shows no band. Nothing unverified reaches the player.

Rating it properly means making the score comparable across genres first — per star
placed, or per deduction step — and then recalibrating once against both. That is a
change to the difficulty model, not to Star Battle, and it would also change how the
Queens ramp reads at 9x9. It is its own piece of work.

## The third puzzle type, and a spec I did not read

Milestone 16 closed with Star Battle deliberately unrated, which left the roadmap's third
game as the next real work. `puzzle-model.md` had already audited what a third type costs
and found every silent-failure hazard fixed, so the groundwork was done and only the game
itself was missing. Train Tracks was the choice.

**Then I got the rules wrong twice, and the second time the answer was in the repo.**

The first error was mine and caught early: I described the game as joining numbered pairs
into one network and built a solver for it. That cannot be a puzzle — a connected graph
of maximum degree two is a path or a cycle, so it holds at most two endpoints, and "all
pairs in one network" is impossible past two pairs. A rule set that contradicts itself
that sharply is one nobody checked. The reviewer of the rating milestone had already
flagged the same reasoning a few days earlier, so I should have expected the shape of the
mistake rather than making it fresh.

Having corrected that, I told myself I had checked Krazydad's rules, and I had not.
`puzzle-model.md` §2 carries a three-column table whose Train Tracks column is marked
**verified** — recovered from the site's help text and JavaScript, then confirmed by
solving eight of its real puzzles. I read that file earlier in this effort, quoted
section 6 of it, and skimmed straight past the specification in the same table:

| | what I built | what the spec says |
| --- | --- | --- |
| cell state | empty, or the track is here | empty, or one of **six pieces** |
| between cells | adjacency implies a join | **edge reciprocity**, so two adjacent track cells need not join |
| the ends | a cell I chose | **both given**, and running off the grid |
| pre-placed | ignored | `givens`, which the parser must honour |
| class | `TrackBoard` | `TrackGrid` |

Edge reciprocity is the whole game. Without it, a line running alongside itself is
indistinguishable from one turning, and the piece is exactly what says which. The reviewer
caught it with a concrete counterexample — a valid route on a board my solver called
unsolvable — and closing that PR was right; it could not have been patched.

The spec is the answer, and it was already written down. **When a design document exists
in the repository, read it before designing anything it covers.** That is the part of this
worth keeping, more than any of the three bugs underneath it: the solver and the
independent reference agreed with each other on every board and were both wrong, because I
had written the wrong rule into both before either was written.

## Six holes the review found in a type that was not shipping

The first review of the Train Tracks registration found six faults, and every one was
mine and every one was in code I had just written and believed finished. They are worth
listing together, because the pattern is more useful than any of them alone: **five of the
six are a value that was checked at the entry point and then trusted all the way down.**

- The schema documented a piece code `7`. `TrackGrid` has six pieces. A file written to
  the format as documented would validate and then fail to parse. A description is not a
  comment; it is a promise the validator then has to keep, and I wrote one the validator
  did not keep.
- `replay` carried `generator_version` over from the file it was replaying, so
  `verify_replay` compared the file's version with itself and accepted any
  schema-valid value. The check existed, ran, and could not fail.
- `generate` handed the seed straight to `Prng`, which masks to 64 bits rather than
  refusing. `--seed -1` would have written a file recording a seed its own schema
  rejects on read. `generate_puzzle` checks this; the new path did not, because it was
  written by copying the shape of a function without its guards.
- The marks generator's branch is `QUEENS` else Star Battle, so a new enum member became
  a two-star board. Not a crash — the wrong game, generated successfully, by a generator
  that does not know the type exists.
- `render_grid` took a solution and compared it against cell indices, while the type it
  was handed is a piece number per cell. It drew the givens and ignored the solution,
  which looks identical to the no-solution case, so the tests passed.

And then the second review found the seventh, which is the same shape as the whole
family: `Board.puzzle_type` is a `PuzzleType`, and `_genre_violation` handled Queens
and Star Battle and then returned `None` for anything else. Adding the enum member
therefore made a grid of regions and capacities constructible *and* callable Train
Tracks — the marks solver accepting a valid puzzle of a game it cannot express. The
generator guard did not cover it because a `Board` can be built directly.

Five of the seven are the same sentence: **a new enum member widened a domain, and
every function that switched on the old members fell through the new one.** The
compiler did not help, because nothing about a `PuzzleType` that no branch names is
an error — it is a value, and values are what these functions were written to accept.
The fix that generalises is the one that makes the unknown case an error rather than
a fall-through, and it has to be written in each validator rather than once, because
there is no shared code between the two languages to put it in.

The sixth was the app's, and it is the one that would have shipped: registering the type
in `PUZZLE_TYPES` made `puzzleIdsForDay` probe a `-tracks.json` that will never exist,
putting a permanent "not published yet" card on the home page. `Rulebook.published` was
the engine half of that gate and I had added it there and nowhere else — the same
mistake as the `_ids_for_day` loop, one layer up, and I had just written the post-mortem
for the first one.

The honest summary is that a type which cannot be reached is the easiest thing in the
repository to get right, and I got six things wrong anyway. What caught them was a
reviewer reading the diff against the model rather than against my description of it.
That is the argument for the reviewer, not for writing fewer comments.

## A measurement I should have caught the first time

Adding Train Tracks to the engine registry made every `for book in rulebooks()`
test generate a track board, and I read the suite going from four minutes to
seventeen as a CI regression I had introduced. The only engine change in that diff
was three deleted dead checks and an unused import. Re-running the same file on
merged `main` took 36.8s; on my tree, back to back, 32.5s — my tree was slightly
*faster*.

The machine had a game at 200% CPU and a local model server running. This is the
third time in this project that a timing was contaminated by something other than
the code, and the tell was the same each time: a number that changed by 4x from a
diff that cannot plausibly cause it. The check that settles it is a back-to-back
run of the same file on both trees, not a longer wait.

**Before believing your change made something slow, prove the change could.** A
diff of three deleted lines is not a plausible cause of a 4x slowdown, and treating
it as one sends you optimising code that was already fine — which is what I
started to do, twice, before measuring properly.

## A rule that was required, and I wrote it as an error

The app's Train Tracks win check flagged any end running off the grid as a conflict.
That is not a rare edge case; it is what a *correct* answer looks like. A line has
two ends and both leave the board — that is the format's own definition, and
`TrackGrid`'s constructor rejects any grid whose givens do not produce exactly two.

So the first version of the rule rejected every correct solution, and it did so
quietly: no error, no red board, just a puzzle that could never be won. The engine's
solver has the same rule stated as a ceiling it grows into rather than a floor it
checks — `search.open_ends + off_grid <= LINE_ENDS` while searching, `== LINE_ENDS`
at the end — and I had that in front of me when I wrote the check wrong.

What made it findable was not reading the code again. It was generating 400 boards
in the engine, taking each one's unique solution, and asking the app whether it
agreed. Forty out of forty failed, which is a much louder signal than a green test
suite: `Puzzle.size` had just been deleted, every marks test still passed, and the
one rule with no counterpart in Python was wrong in the way a passing test cannot
see. The second bug that sweep found — reading a given of `0` as "this cell must
stay empty" rather than "nothing is given here" — came from the same place.

Then a reviewer found the third, and it was the same shape as the second one. The
win check asked whether any row or column *exceeded* its clue, which is what
`conflicts` reports — but a line can be short of a clue without exceeding it, and
reciprocity plus exactly two open ends does not rule that out either. A perfectly
formed seven-cell path through a 4x4, every join reciprocal, both ends off the
grid, and row 0 holding 1 cell where the clue says 3. The app recorded that as a
solve.

What makes it worth three paragraphs rather than one line: I had *written* the rule
correctly in the docstring above the function — "counts, asked for equality, because
a short row is a puzzle in progress" — and then implemented the ceiling instead.
The prose was right and the code was not, and the prose is what I re-read while
checking whether the reviewer had read it properly. It is a reminder that a
docstring is a claim, not a control, and the cheapest possible check on it is a
test that states the case the docstring says cannot happen.

A second pass on the same review found two more, both in what the player is told
rather than in what is computed: a solved route shared as text mixed the wide
emoji `⬛` for an empty cell in among one-column box-drawing characters, so every
piece after an empty one shifted and the copied answer stopped being the shape it
was; and every conflict was announced as "not connected", including a fully
connected route that was simply over a row clue. The second is the worse of the
two. A wrong label does not merely fail to inform — it tells a screen-reader user
they have a fault they do not have, while the one they do have goes unnamed.

A third pass found two more, and the first of them was in the *engine*, not the
app: `TrackGrid`'s validator counted open ends by counting the pieces that carried
them. A corner turn leaves the grid at both ends at once, so a grid with three
open ends could be counted as two and accepted — a grid with no solution at all,
which the generator's uniqueness gate would then reject much more expensively.
The rule and its own comment said "ends"; the code said pieces, and the comment is
what I had read back to myself twice.

That one also turned out to have a test pinning the wrong behaviour, by name and
with a comment saying the spec checks *cells*. Its example did not distinguish the
two rules — one corner piece alone is rejected either way — so the test asserted
a distinction it never exercised. Replacing it meant working out which rule was
right rather than which one was old, and the answer is that both checks are
needed: exactly two ends, and never both on one cell, because a line's two ends
are two cells.

The second was the roving tabindex, and it had been wrong in the marks board for
the whole project. Moving the tabindex does not move focus, so an arrow key acted
on the new cell while the focus ring stayed on the old one. Nothing caught it
because the two agree until the first key press, and there is no DOM test in the
project to press one.

The last two were the same failure wearing different clothes, and they are worth
naming because they are the kind that never show up as a crash. Both were the
board telling a player they had done something wrong when they had not. An end
pointing at an empty cell was reported as "does not meet", which is a fault; it is
actually a route that is not finished yet. And when a player created a third
off-grid end, the report pointed at the two *given* ends as well — two fixed clues
the player cannot change — while hiding the end they had just placed.

And the next round caught me having fixed only half of it: I had split the rule in
two and given them different *words*, while the board still painted both red and
still said "some track does not meet — fix it". A distinction the player cannot see
is not a distinction. That is the third time in this run the same finding came
back wearing a different hat, and the pattern is worth keeping: **fixing a
presentation fault by changing only the text is half a fix**, because the styling
and the status line are the same statement in a louder voice.

Both are the conflict marker doing its job too eagerly. The rule I would carry
from them: And then the same fault arrived a fourth time, one level down: when a *given* faced
a piece that did not face back, the fault was recorded against the given. Reciprocity
is symmetric, so only one cell of a pair reports — and it was the immutable one. The
board marked a clue red and left the piece the player could actually correct
untouched. The generalisation is the one worth keeping, and it took a fifth pass to
state it plainly enough to survive: **the cell a fault is reported against must be
a cell the player can change, and the action must be one that helps.** Not the cell
where the problem was noticed, not the first one the loop reached, not every cell
sharing the offending row.

Five separate findings in this one PR were that same rule missed in five places — a
given marked red, an empty cell marked red, a whole row marked red including the
parts that cannot help — and every one arrived reading as a bug report about
something else until you notice they are the same sentence. Which is what a run of
same-shaped findings means, and it is worth saying plainly rather than fixing the
sixth one next week: when the fifth arrives, the answer is not the fifth fix. It is
to write the rule down where the next one will find it.

**a warning that names the wrong fault is worse than no warning**, because
the player learns to ignore the marker, and then it is not doing its job either.
Knowing what is wrong is not the same as knowing what to do about it. Neither
conformance suite covers a half-finished board, because the engine never has one.
The gap is structural, and the answer to it is a cross-check against generated
ground truth rather than another hand-written fixture: three of my hand-built
fixtures were wrong before one was right, and each was wrong in a way the test
suite reported as a pass.

## Registering a type without shipping it

`TrainTracks` is in the engine's registry, generating and proving unique solutions, and
nothing has been published for it. That is one boolean, `Rulebook.published`, and it is
the only thing standing between a finished solver and a broken daily archive — because
the alternative is worse than it looks. `publish.py` and `schema_ids` both iterate the
registry, so registering the type alone would have started writing files the app's
parser rejects, and `conformance/id-cases` is asserted for equality from both languages,
so the schema's id pattern would have widened without the app ever learning the suffix.

It is tempting to leave the type unregistered until all of that is ready, and the guard
against that is worth naming: `rulebook_for` raising on an unknown type is the thing that
stops a new type being published under another type's rules. Hiding a type that works
reintroduces exactly the failure the registry was built to prevent, only silently. Being
registered and unpublished keeps the loud guard and adds a quiet one.

The second gate was in a place I would not have looked. `publish.py` has two loops over
the registry — the one that writes files and the one that decides whether a day is
already complete. Gating only the writer meant every day looked permanently incomplete,
so a rerun tried to republish the archive from the beginning, forever. A gate that is not
applied at every read of the thing it gates is not a gate; it is a branch in one place
and a bug in another.

`deduce` returning `None` was the same shape of decision. There is no deduction engine
for this genre, and the contract makes that a value rather than a gap, so a board with
no hints is one the app already knows how to render. The alternative — inventing a
solver to fill the signature — would have produced hints that could contradict the
answer, which is worse than no button.

## What the clues are actually for

The row and column counts are not only the player's clues. Proving uniqueness means
exhausting the search, so the search's cost *is* the generator's, and because cells are
walked in row-major order, every cell to the right in the current row and every row below
are still undecided — a hard ceiling on what that row and column can still reach. A 7x7
is decided in milliseconds.

That is the Star Battle rating lesson arriving from the other side: the two existing
genres are fast because their constraints are tight, and a third genre has to earn that.
It is also why the counts had to be part of the model rather than something checked at
the end.

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

The hint engine stayed single-star for a while, and the app followed it rather
than papering over it: `firstHint` returned `null` for a Star Battle board and
the Hint button was not rendered. A hint engine that reasons in one star and
speaks in two produces confident nonsense, and `null` was the only honest
answer at the time.

It is no longer single-star. `hints.ts` now carries a *need* per group instead of
a has-a-star flag, exactly as the engine had already been ported to, so one star
and two travel the same code — and it gained `fill`, the rule that makes a
many-star board tractable: a group needing exactly as many stars as it has cells
left has every one of them a star. Measured over 60 generated 8x8 two-star
boards, `fill` fires 1,058 times, more than any other rule except the trial
search. So it was missing coverage rather than being unnecessary, and a
Star Battle board that opened with an `intersection` was hiding a rule the
player meets constantly.

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
