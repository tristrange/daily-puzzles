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
| 17 | Train Tracks: a per-type contract the model was missing, and the type registered against it | done — engine and app, published |

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

And then the one that is not about the same rule at all, and is the worst of the
lot for being invisible. At 480px a 7x7 cell is about 61px and the piece glyph was
34px, so every rail stopped 30px short of the cell edge — and two cells whose
pieces genuinely met were drawn as two pieces that did not. The gap *is* the game:
reciprocity is the rule, and a line the player has to reason about instead of see
is a line they cannot play. It is drawn now as two arms from the centre to the two
edges, which is a thing a font character cannot do, because its width is the font's
and the platform's and the size's.

**Then I went and got a browser, and it was still broken.** Two more faults, both
invisible to every check I had: empty cells rendered in the page's own colour so the
board was a blank page with two clues on it, and the arms stopped short of each cell's
edge so a joined pair looked unjoined. The first was *caused* by my own fix an hour
earlier — I had removed the cell border to close the gap between arms, and removed
the only thing that made a cell visible. A fix that breaks something else is not a
fix that passed, whatever the tests say.

The lesson is the one I keep earning: **some defects are not assertable, they are
only visible, and installing the thing that can see them cost two minutes and found
what an hour of reading had not.** I had written that down in this very entry, above,
and then shipped the bug anyway — which is worth knowing about myself, and is
probably the reason to write it down at all.

The failure is worth naming because nothing reported it. No test failed, no type
complained, the markup was correct, the arithmetic in the CSS was correct, and the
board was still unreadable — a defect that exists entirely in the space between what
the code says and what it looks like. The only thing that could have caught it was
looking at it, and there was no browser here to look with. **Some defects are not
assertable; they are only visible.** Writing a test that checks for the absence of
the glyph proves the code changed, not that the picture is right, and it would have
been the comfortable thing to do while still shipping a broken board.

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

## A `git add` that stopped publishing for four days

The nightly published on 8 October and not again until a person noticed. Every run
since had failed, silently enough that nothing but the missing puzzles showed it.

The cause was one line in the workflow. The job's working directory is `engine`, so
the baseline is `tests/fixtures/hint-baseline.json` from there — and the line said
`git add ../app/public/puzzles engine/tests/fixtures/hint-baseline.json`. A pathspec
that matches nothing is not a warning to `git add`, it is a fatal error, so the job
died after doing all the work and before committing any of it. The puzzles were
generated, the baseline was rewritten, and then the run threw the results away.

It arrived with #53, which was itself a good change — sweeping every reachable hint
position instead of twelve hand-picked ones — and it sat unnoticed through four
scheduled runs. Nothing about it was subtle and nothing about it was loud either.

**The lesson is not "test the workflow."** It is that a scheduled job's only
evidence of existing is its output, so an archive going quiet looks exactly like a
day nobody played. Two of the three facts in this repository that would have caught
it — the archive growing, the deploy running — are both *absences*, and nothing in
CI treats an absence as a failure. The check that would have caught it is one line:
fail the run if the archive has not grown for two days. That is not built, and it
should be, because the same failure will happen again in a different costume.

And the general shape of it is worth keeping next to the review findings: **a tool
that reports a problem and a job that reports success are different things, and only
one of them is a test.** `git add` was right and the job was wrong, and the job had
no way to say so.

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

## What a cell can hold

Train Tracks went out with the honest interaction and the unusable one: a click cycled a
cell through empty and then each of six tracks, because the piece *is* the orientation and
so there was no separate rotate step to invent. Seven clicks to lay one piece, on a board
that wants twenty-odd of them. Six things were asked for — a cross, a question mark, a
picker, an eraser, right-click, and drag — and the answer is that they are all one
decision: **what does a click put in this cell.**

So there is a brush, and it is a number. Zero, a piece 1-6, or `CROSS` and `MAYBE` past the
end of the pieces. A union would have been a second thing to keep exclusive that already
cannot collide, and the eraser would have been a case in it; instead the eraser *is* zero,
and because the brush toggles, running an eraser over an empty cell computes the same
value it already had and returns the same object — which the view reads as "changed
nothing" and does not push a history step for. One type, one function, one rule.

**The toggle is what makes nine entries survivable.** Applying a brush to a cell already
holding it clears it, so a misjudged click is undone by clicking the same thing again. The
picker therefore needs no second gesture for undoing, which is what it would otherwise
have needed once there were nine targets rather than three.

Two things had to give, and the first was not obvious until the tests ran. `isOn` meant
"this cell holds something", and it now means "this cell holds a *piece*". Every caller
wanted the piece — a cross counts towards no row clue, is a pair of no ends, and is not a
cell the line has to reach — but the name had been doing the reasoning for them. Reading a
cross as a piece would have made the win check pass on a board with two crosses in it, so
the function is now `hasPiece` and says what it means.

The second is that `?` has no engine behind it. Nothing derives it, nothing checks it,
and it does not block a solve. A note is the player's reasoning, not a claim the answer can
fail: someone whose last `?` outlived the piece they were undecided about has a stale note,
not a wrong answer, and blocking the solve over it would make that last note the thing
standing between them and finishing.

Right-click erases, which is the one thing the picker cannot do for you mid-thought — you
reach for it after the mistake, not before it. The marks board uses right-click for a
cross, and consistency across games is worth something, but there the cross is a state you
cycle through and here it is a picker entry you chose, so the shortcut is worth more as
the thing that needs no choosing. `contextmenu` is what a two-finger click raises on a
trackpad, so it is the same gesture on a Mac. That needed `event.ctrlKey` in the stroke
guard as well: macOS reports a two-finger click as a *primary* press with the modifier set,
not as button 2, so without the guard the board painted its brush and then erased it.

Drag applies the brush to every cell it crosses, whatever the brush is. The marks board
deliberately stops a stroke short of pieces; here you chose the brush, so a stroke cannot
misunderstand it, and a whole stroke is one Undo however many cells it covered.

**Still to look at:** the picker is one row above the board, not one above and one below.
The board is as tall as a phone viewport, so a copy beneath it scrolls off exactly when it
is wanted — but that is reasoning, not a measurement, and it is the kind of thing that
should be tried on a phone rather than argued about on a desktop.

## Train Tracks should use the whole board

Fourteen of the twenty published Train Tracks boards have a zero row or column clue.
Those lines can be crossed out immediately, reducing the area the player has to reason
about. New generation now requires every row and column to contain at least one track.
The route is checked before piece assignment and uniqueness search, so an unused line
costs another random walk rather than another solve.

This is generator version 2. Version 1 retains its original random stream and may still
produce zero clues when replaying the archive. The parser and gameplay rules continue
to accept them; no existing file is rewritten, including files generated ahead of their
date. Unsupported generator versions fail explicitly. Exhausting generation raises the
publisher's normal retry error, allowing it to advance the seed.

Measured locally over 100 consecutive seeds and the 20 published seeds, all 120 new
7x7 boards used every line. 117 completed within a five-second measurement budget, with
a median of about 0.04 seconds. The three slower seeds completed in 5.3–8.7 seconds on
rerun. The version-1 sample completed all 120 within that budget, with a median of about
0.004 seconds and a maximum of 3.0 seconds. These are sample timings, not runtime limits
or guarantees. All 60 committed puzzles still passed replay verification.

Larger boards and size-based difficulty tiers remain a separate change. Using every
line makes the nominal board size meaningful, but neither that nor size alone measures
the difficulty of the deductions.

## A calmer daily puzzle interface

The shared shell now uses system typography, a quiet blue accent and solid surfaces
for cards and controls. Today has one dated heading and three distinct game cards;
each puzzle puts its game name above the board. The region palette and game rules
remain unchanged. There are no new dependencies or animation libraries.

Auto remains the default appearance and follows the system through `color-scheme`.
Light and Dark overrides persist locally. Contrast tests cover the new surfaces,
primary actions and fixed track clues; theme-picker tests cover the default, saved
overrides and unavailable storage. Reduced motion removes press transitions, reduced
transparency makes the header solid, and increased contrast strengthens borders.

Browser checks covered light and dark appearances, reload persistence, keyboard play
and undo, the skip link, and layouts from 320 to 1280 pixels wide. A complete Queens
solve still recorded successfully. Rules anchors now clear the sticky header, and
unavailable-puzzle messages leave room for the back control. These checks use desktop
viewport resizing; real phone touch testing remains useful.

Screenshots: [light](images/redesign-light.jpg), [dark](images/redesign-dark.jpg),
and [mobile Train Tracks](images/redesign-mobile-tracks.jpg).

## Scattered Train Tracks givens and larger-board proof

Version 3 reveals both endpoints, then splits the largest unknown sections of
the route. Ties choose the earlier route position. Each extra given has at least
one unrevealed cell between it and any other given along the route; pieces can
still sit close geometrically when the route doubles back. The existing interior
clue cap and whole-set `max_givens` cap remain. Every new row and column is nonzero.

Generation uses deterministic work limits: 10,000 visited solver states per
uniqueness check and 1,000,000 per seed. An incomplete check adds another eligible
clue; aggregate exhaustion rejects the seed for publisher retry. A single solution
found before exhaustion is never accepted as a uniqueness proof. Other solver
callers remain exhaustive by default. Versions 1 and 2 keep their original prefix
givens and unbounded replay; all 60 published files still replay without changes.
Full fixtures pin versions 2 and 3 independently of the current-version constant.

The initial 25,000-per-check/250,000-per-seed policy ran out before reaching useful
clues on 12x12 seed 0. Raising the aggregate to one million recovered it. A partial
probe with 25,000 per check still rejected large seeds 4, 15 and 21. Seed 4 passed
in about four seconds with 10,000 per check, so the final full probe was restarted
with that policy. Budgets are frozen as part of version 3's replay contract.

`python -m tools.benchmark_tracks --out /tmp/tracks-probe.json` tested seeds 0–99
for each size, in isolated workers with a ten-second deadline including validation.
Generation timings exclude worker startup and validation. Every returned board
passed a separate unbounded solution enumeration and direct counts, connections,
endpoints, givens and connectivity checks. No generation errors, timeouts or
validation failures occurred in the final 300-seed batch.

| Board | Completed | Median generation | Maximum generation | Total givens |
| --- | --- | --- | --- | --- |
| 8x8 | 100/100 | 0.18s | 0.82s | 2–16 |
| 10x10 | 100/100 | 0.78s | 2.83s | 2–23 |
| 12x12 | 100/100 | 1.37s | 7.82s | 2–32 |

Measured on macOS-27.0.1-arm64-arm-64bit-Mach-O / Python 3.13.15. These are sample results,
not speed guarantees on other machines or a difficulty rating. Failed and timed-out
seeds remain in the benchmark denominator; interrupted runs retain completed rows.
The tool exits unsuccessfully if completion falls below 95% for any size or any
returned board fails validation. Full local verification passed 462 engine tests,
423 app tests, engine typing/lint/format, schema IDs, app typing/lint and production
build. App lint retains its existing non-failing TracksStage effect warning.

Daily publishing remains 7x7 in this PR. The follow-up enables Small 8x8, Medium
10x10 and Large 12x12 every day, with separate IDs, progress and solve records.

The independent whole-branch review found no actionable issues and reran 55 focused
solver/benchmark tests. Daily variants, activation and mobile changes remain PR 2.

GitHub review identified missing README command documentation and a stale version-2
description. Both READMEs now document the benchmark and the engine guide describes
version 3 and legacy replay. CLI help and all three replay fixture tests passed.

## Three daily Train Tracks sizes

Small 8×8, Medium 10×10 and Large 12×12 activate on October 17, 2026. These are
size names, not difficulty ratings. The shared ID contract owns activation,
suffixes, dimensions and labels. Named IDs must match the declared family and
board dimensions in both parsers. Publication hashes each full ID, retains the
version-3 budgets, and retries seeds without substituting smaller boards.
Interrupted runs fill only missing slots. Every existing corpus byte is preserved.
Main was checked before delivery: its latest legacy tracks date is October 16;
October 17 also clears the current three-day publishing lead. A corpus test guards
that activation follows the latest legacy date.

The app groups three links in one card, including independent solved/unpublished
states. Labels continue through puzzle pages, archive, recent solves and shares.
Train Tracks-only snapshots preserve each unfinished board, notes and active time;
givens and board fingerprints are validated. Undo stays visit-local. Completed
boards replay fresh; first solves remain independent and immutable.

The actual publishing recipe generated October 17–26, all three sizes each day.
All 30 boards passed independent unbounded two-solution enumeration, direct rule
checks and deterministic replay. No seed failed or required a retry. The first
12 boards (October 17–20) are committed. Day timings include generation and
independent validation; every day stayed below the 60-second acceptance limit:

| Day | Three boards plus validation |
| --- | --- |
| 2026-10-17 | 1.321s |
| 2026-10-18 | 1.288s |
| 2026-10-19 | 0.994s |
| 2026-10-20 | 3.626s |
| 2026-10-21 | 0.721s |
| 2026-10-22 | 0.522s |
| 2026-10-23 | 1.378s |
| 2026-10-24 | 3.249s |
| 2026-10-25 | 0.749s |
| 2026-10-26 | 1.586s |

Measured on macOS-27.0.1-arm64 / Python 3.13.15. These are sample timings, not
hardware guarantees. [Raw report](measurements/train-tracks-daily-sizes.json)
retains each initial seed, attempt outcome and board timing. Generation policy
uses state budgets, never measurement wall-clock deadlines.

Browser checks used a separate local origin and a temporary future-day preview
rendered by production TodayCards/ArchiveGroups/Shell components. The preview
controlled Small's solved state and other families' unpublished state; it was
removed after checking. Actual puzzle pages were played normally through the
visible controls. Small, Medium and Large all solved independently; stats showed
three solves, one streak day, and their original times. Large result sharing
included its size and exact route. Reload restored unfinished Cross/Maybe notes;
leaving Large at 0:25 and returning after playing another size resumed at 0:25.
Reloading a completed board started a fresh replay without another solve.

Light, Dark and Auto were checked; Auto remained selected after reload. Layouts
fit at 320px, 390px and 1100px without horizontal overflow. Size links and all
picker faces measured 44px high (picker faces also 44px wide). Large-board cells
measured 18.73px at 320px and 24.56px at 390px. The board remains usable with
keyboard input, but precise touch targets are small on narrow phones; a zoom
interaction is a future improvement, not part of this PR.

[Chooser and archive preview](images/tracks-sizes-chooser.png) ·
[Large board in mobile dark mode](images/tracks-large-mobile.png).

Verification: 491 engine tests and 460 app tests passed, plus engine typing,
lint/format, schema IDs, all 75 committed puzzle replays, app typing/lint and
production build. Regenerating the hint baseline produced the updated 1,764 positions
over 42 marks puzzles; Train Tracks retains its existing separate genre gate.
App lint retains the existing non-failing TracksStage effect warning.

The single independent whole-branch review ran 192 app and 55 engine regressions.
It found one recovery defect: interruption during a file write left a truncated
final filename that the next publisher run skipped. A new test reproduced the
failure, then passed after writing to an ignored temporary sibling and renaming
only after completion. Completed Small bytes survive and Medium/Large resume;
all resumed files verify. The full suites were repeated after the fix. No critical
or minor findings remained. A reviewer browser Back check restored the timer;
native-browser back/forward-cache behavior was not separately isolated. The
preferred reviewer hit its usage limit before a verdict, so the available model
provided the single review.

The final main refresh added the newly published October 16 Queens, Star Battle
and legacy Train Tracks files plus their hint baseline. They were merged intact;
activation stays October 17 and the corpus boundary regression still passes.

## Move the three-size rollout to October 14

The rollout now starts October 14, 2026, superseding the original October 17
activation above. The daily publisher generated all nine Small/Medium/Large
boards for October 14–16 using the unchanged full-ID seed recipe and version-3
budgets. October 17–20 boards remain intact. All nine new boards passed independent
unique-solution/rule validation and replay; rerunning publication was a no-op.
All 75 previously committed puzzle files were compared with main byte-for-byte
and preserved, bringing the corpus to 84 files.

Queued 7×7 boards for October 14–16 remain archive extras. Archive discovery now
probes the legacy slot in addition to current daily slots, deduplicating requests
before activation. This adds at most one probe per archive day after activation;
it requires no retirement-date configuration. The daily chooser still receives
only the three named sizes. Old links, progress, solves and board fingerprints
remain valid.

Regression tests observed tomorrow's three-size schedule failing before the
cutover moved, and the queued legacy archive entry disappearing after moving
only the date. Both now pass. The old latest-legacy-date gate is replaced by a
check that all three boards for the first four rollout days are committed and
valid. Window tests retain a fixed preactivation clock; transition tests explicitly
cover October 13/14. App suite: 461 passed. Publisher/rulebook/ID conformance
checks, typing/lint/format, schema pattern and app production build passed.

## English word-path engine feasibility

The first Wend-inspired milestone is engine-only. No fourth game is registered,
no puzzle files are published and no existing game changes. The prototype uses
an authored 748-word English pilot vocabulary and 5×5 boards with lengths 3, 4,
5 and 6: eighteen letters and seven blockers. There is no ScaleDown dependency,
API call or model-generated daily content.

The exact counter enumerates every legal pilot-vocabulary path and complete cover.
It disregards submission order and reversed palindrome direction, but preserves
distinct traces through the same cells. Its search budget includes placement,
word enumeration and cover search; a found answer followed by exhaustion is not
a uniqueness proof. The seed-7 replay also agrees when vocabulary order reverses.

Uniqueness was not enough. The first 100 seeds all verified, but 95 had extra
legal paths, with up to ten alternatives. After rejecting candidates with more
than two extras, seeds 0–99 still produced 100 unique boards. A separate
direct-letter reference (no production neighbours, prefix pruning or cover search)
confirmed all 100 answer sets. A second run reproduced every board, answer path
and work count. Fresh unbounded enumeration and direct rule checks are also part
of the probe CLI, with failures retained in its denominator.

The accepted sample had four to six candidate paths, spent 215–1,799 search
states, and took a median 0.0020s / maximum 0.0061s to construct on the recorded
local machine. These are measurements, not deadlines or performance guarantees.
The [raw report](measurements/word-paths-pilot.json) retains all boards, answer
paths, vocabulary fingerprint and failure outcomes. It is review material, not
client puzzle data.

An editorial inspection of the first ten layouts found all letter cells connected
(the placement walk ensures that), recognizable answers and some remaining traps:
HAIR inside CHAIR, FLY inside FLYING, and ICE/EIGHT inside JUICE/WEIGHT. Undo and
honest local-word feedback remain important. No human playtest or whole-English
uniqueness claim has been made. Vocabulary coverage, starting-point quality and
acceptable traps must be settled before publication. The file contract, UI and
daily activation are the later milestones in the design.


## 2026-10-14 — Word Paths generator and file contract

The engine prototype now has a frozen v1 recipe and a shared file contract.
`word-paths` uses `-words` IDs; both registries leave publication off. Files
carry letters, null blockers and word lengths, never answer words or paths.
The browser imports exactly the same authored 748-word acceptance vocabulary;
a digest protects it from silent edits. A future vocabulary or recipe change
must retain v1 replay and introduce a new version.

Ten canonical shared files cover low and high unsigned seeds. Both parsers
assert their board values and malformed inputs. A 100-seed batch is checked by
the independent direct-letter cover solver, and golden fixtures pin replay.
Adding a trailing-newline case exposed a regex difference between validators:
explicit one-character schema bounds make rejection agree in both languages.
Existing daily slots stay unchanged, and all 84 published files still replay
without any archive diff. The browser has a clear unpublished-route response.

This freezes a finite game vocabulary for reproducibility, not publication
quality. Human word-list review and playtesting remain release gates. UI,
mobile tracing and daily activation are subsequent PRs; no ScaleDown or new
runtime dependency was introduced.


## 2026-10-14 — Playable Word Paths preview

Branch `feat/word-paths-gameplay` adds ten playable previews through How to play,
without publishing daily Word Paths files. English v1 paths have their own pure
state transitions, and shared geometry fixtures agree with Python. Saved paths
are validated against the frozen vocabulary, lengths, adjacency and overlap;
preview keys and results are isolated from daily records. Active time uses a
monotonic clock and pauses while hidden/unmounted. Reset is reversible and Undo
can remove a restored accepted word.

Browser checks completed a full board with keyboard input; vertical dragging
accepted BIRTH, and a tap followed by horizontal dragging accepted GEM. Releasing
outside the board canceled a trace without submission. Reload preserved accepted
words, unfinished CA and elapsed time; post-reload Undo and Reset/Undo worked.
Daily stats were empty before and after a complete preview solve. Normal share
text, spoiler paths and the selected-board link are unit tested. The copy button
acknowledged success, but the browser clipboard bridge returned old unrelated
text, so native clipboard contents were not independently confirmed.

At 375×812, there was no horizontal overflow and cells were about 62px wide.
The computed touch policy caught an inherited `none` rule overriding the first
Word Paths selector; raising its specificity restored `pinch-zoom`. Light and
dark screenshots are committed below. Auto was restored after testing and the
viewport override cleared. Physical phone touch/pinch and assistive-technology
calibration were not available and remain release checks; pointer/keyboard and
semantic accessibility were checked here.

Local verification: 541 app tests, 578 engine tests, both type checks, lint,
format/build and shared schema-ID checks passed. The existing TracksStage lint
warning remains unchanged. All 86 published puzzles replayed, with no archive,
existing appearance preferences or AGENTS.md modifications.

- [Light phone preview](measurements/word-paths-preview-phone-light.png)
- [Dark phone preview](measurements/word-paths-preview-phone-dark.png)

Vocabulary familiarity and enjoyment still need human playtesting. Hints, new
sizes/languages and daily activation are deliberately outside this PR.


## 2026-10-14 — Word Paths daily rollout prepared

Branch `feat/word-paths-daily` prepares one English 5×5 puzzle per day starting
October 15. A shared activation date and explicit daily-slot fixtures keep the
publisher and browser aligned. Before activation, no Word Paths slots are required
or probed; existing archives are not backfilled. Afterward, the normal nightly
publisher resumes missing word slots without rewriting files. Seven initial boards
cover October 15–21 using the unchanged frozen v1 recipe and vocabulary.

All seven boards replay exactly and agree with the separate direct-letter cover
solver. Each has one complete cover and zero to two extra legal word paths. An
inspection of all 28 answer words found familiar vocabulary; this is an editorial
inspection, not a claim of human playtesting or whole-English uniqueness.

The ordinary route loads the daily word stage. Browser checks completed October
15 and recorded one Word Paths solve at 1:02. A faster replay at 0:18 retained the
first record and the stats page still counted one solve. A fresh October 16 board
fits 375px without horizontal overflow and retains `pinch-zoom`. Auto appearance
was preserved. [Phone screenshot](measurements/word-paths-daily-phone.png).

Publishing word files exposed a stale hint-corpus test that excluded only Train
Tracks. The production baseline already filters marks boards; its coverage test
now does the same and still pins all 1,845 positions across 44 marks puzzles.
The reproduced failure passes after that correction; no baseline data changed.

The rollout remains a draft until the maintainer tries tracing/pinch and sharing
on a physical iPhone and confirms the words feel reasonable. Screen-reader and
native clipboard validation are still outstanding. Home Screen/offline support,
hints, extra sizes and languages remain later milestones.

Final local checks passed: 547 app tests, 583 engine tests, both type checks,
lint/format/build, shared schema-ID checks and replay verification for all 93
published files. The existing TracksStage lint warning is unchanged. The original
86 puzzle files, hint baseline, theme implementation and AGENTS.md have no diff.
The live preview route was also checked successfully on GitHub Pages.


## 2026-10-15 — Broader Word Paths vocabulary

The daily rollout now uses version 2: 16,781 frozen 3–6-letter words selected
from SCOWL 2020.12.07 level 60, including CAME, MEGA and ERA. Generated answers
still come from the familiar 748-word pilot pool. Full source notices ship with
the app and are linked from How to play; archive hash and selection are documented.

Broader acceptance makes some old boards ambiguous: preview Board 2 has two
covers under v2. V1 vocabulary, recipe, golden files and progress keys therefore
remain unchanged. V2 uses separate progress keys and rejects unknown versions.
Only the unpublished seven-board daily batch was replaced; ten new preview
boards use separate hashed seeds to avoid repeated layouts. Each new board is
independently unique and replays exactly. The 100-date-seed probe succeeded for
99 seeds; its one bounded failure is retained in the report. No weaker-list
fallback was added. Its known failed seed recovered after eleven seed bumps
through the existing publisher and independently verified. Missing-slot recovery
continues through that publisher.

Production-build browser checks at 375px accepted EWE on a non-answer path,
restored it after reload and allowed Undo. A daily solve at 0:34 entered history;
a replay at 0:15 retained the first record. Preview progress stays separate.
There was no horizontal overflow; `pinch-zoom` and Auto appearance remained.
[New-word phone screenshot](measurements/word-paths-vocabulary-phone.png).
The maintainer independently confirmed the earlier preview works on an iPhone.

Word Paths is loaded separately so the broader dictionary is only fetched when
playing it. Unchanged geometry was moved out of the game checker to prevent the
shared result formatter from importing the dictionary into other games. No new
runtime dependencies or gesture changes were introduced.

Screen-reader and native clipboard validation remain outstanding. Home Screen
and offline support, hints, languages and additional Word Paths sizes are deferred.

Final local gates passed: 596 engine tests, 565 app tests, both type checks,
engine lint/format, app lint/build, schema-ID consistency, all 93 archive replays
and all 1,845 hint-baseline positions. The existing TracksStage lint warning
remains; the broader dictionary introduces no build-size warning. The original
86 published puzzle files, ten v1 golden files, v1 recipe/list and AGENTS.md are
byte-identical to the branch base.

## 2026-10-15 — Home Screen installation

Branch `feat/home-screen-install` adds a standalone web app manifest, iPhone
metadata and opaque 180/192/512px PNG icons matching the existing four-cell brand
mark. The favicon SVG is the editable icon source. Scope, start URL and icon
URLs are relative so both local root and the GitHub Pages project path work.
Identity uses the launch URL fallback, without its fragment. The launch URL
opens Today through the existing hash router. No runtime dependencies, install
banner, service worker or cache policy were introduced.

How to play and both READMEs explain Safari’s Add to Home Screen flow, the
Open as Web App option, online requirements and separate iPhone app/Safari saved
data. Existing progress, stats and appearance implementations are unchanged.
See [Apple’s installation instructions](https://support.apple.com/guide/iphone/iphea86e5236/ios)
and [WebKit’s storage behavior](https://webkit.org/blog/14787/webkit-features-in-safari-17-2/).

The existing 565 app tests, type check and lint passed (the existing TracksStage
warning remains). Real production builds at `/` and `/daily-puzzles/` passed an
assertion check resolving linked manifest/icon paths, PNG dimensions, stable ID,
standalone mode and launch URL/scope. A matching-base production preview rendered
installation instructions at 375px with no horizontal overflow; Auto remained
selected and navigation reached Today. [Phone-width screenshot](measurements/home-screen-phone.png).
The preview must use the same BASE_PATH as its build.

Actual iPhone installation/relaunch has not been tested by this desktop session.
Offline support and progress transfer remain separate work; this PR promises
online installation only. Engine and puzzle content have no diff.

The focused review caught the initial explicit `id: "./"`: unlike scope and
icons, an explicit ID resolves against the launch URL’s origin and would identify
the app as the shared host root. The asset check had used the wrong base for ID
resolution. A regression test reproduced the project-path collision; removing
the optional ID uses the stable launch-path identity and passes both hosting
paths. The corrected real-build assertion agrees. Final app suite: 567 passed.


## 2026-10-17 — Offline play

Branch `feat/offline-play` adds two cache owners without dependencies. The
production build precaches versioned HTML, code (including lazy Word Paths),
styles and public shell files. Navigation serves the installed build; updates
wait for all controlled windows to close. Cleanup is scoped to this base’s old
app caches. The puzzle loader saves only schema-validated responses with the
requested ID, tries the network first and revalidates saved fallbacks. Missing
storage and quota failure do not prevent online play. Existing progress/stat
keys, puzzle content, rules and touch controls are unchanged.

Readiness, offline and unavailable-download messages explain what is saved.
Today fetches its available slots; browsing Archive saves the recent boards it
loads. There is no background full-archive download. Queens/Star Battle still
restart unfinished attempts on reload; Tracks/Word Paths retain existing resume
behavior. READMEs and help explain cache eviction, separate iPhone app storage,
waiting updates and the need for a retirement worker when rolling back.

Local app suite: 603 tests passed, plus TypeScript and both root/project-path
production builds. Lint passed with the existing TracksStage effect warning.
Emitted-worker assertions confirmed all four emitted code/style assets, static
shell files and base paths, without puzzle JSON in the worker cache.
Worker tests cover both bases, failed installation, scoped cleanup, GET-only
routing, lazy files and worker-only/asset-only cache version changes. Loader
coverage includes all four families, words v1/v2, invalid responses/downloads,
wrong IDs, unknown words versions, fresh precedence and denied/quota storage.

Production-browser checks used local previews, stopping only our processes:
- `/daily-puzzles/`: loaded Today and Oct 16 Word Paths online; stopped server;
  reloaded, accepted JAM, reloaded again with JAM restored, then used Undo.
  Offline archive discovery listed the seven downloaded boards. An unopened
  Oct 15 board asked for a connection; restarting the server and reloading
  recovered the full board. [Restored word screenshot](screenshots/offline-play/word-paths-server-stopped.png).
- `/`: opened Today online, stopped the server, reloaded and opened Word Paths
  for the first time in this build. Its lazy code and saved board loaded at
  375px with no horizontal overflow and Auto selected.
  [Phone-width screenshot](screenshots/offline-play/root-phone-server-stopped.png).

The server-outage test leaves the browser’s `navigator.onLine` flag true; the
actual offline-notice branch is covered separately by a rendered test. It does
not claim a physical iPhone airplane-mode/Home Screen test. Cache eviction and
multi-window update timing were not exercised on hardware. All temporary tabs
and preview servers were closed, and viewport sizing was reset.

Following PRs address the requested wide-board/sidebar layout, compact archive
with a URL-backed game selector, per-game stats filtering and dedicated rules
links. The board’s existing 480px/48svh cap must change with the sidebar; moving
controls alone would leave the cells small.


The final fresh-context review found two important issues, reproduced by failing
regressions before correction: default HTTP caching could mix old HTML with new
chunks during worker installation, and a failed puzzle save was silent after
shell readiness. Installation now uses reload-mode Requests for every shell
file. A two-build HTTP-cache simulation verifies build B’s HTML and lazy assets
remain available after cache A is removed. Failed puzzle saves now announce a
warning while keeping online play usable. Both regressions pass with the full
603-test suite. The reviewer reported no minor findings. Existing marks-game
reload behavior and the subsequent UI redesign remain intentionally separate.

PR #76’s automated review identified another classification gap: uncached HTTP
408/429 responses looked unpublished because only 5xx responses were marked
unavailable. The shared loader now treats unsuccessful non-404 responses as
unavailable, preserving missing-file behavior for 404 and validated cached
fallbacks for every failure. Regressions reproduced 403/408/429 returning the
wrong error before the one-line fix; all 611 app tests, TypeScript, lint and the
production build passed afterward. The existing TracksStage lint warning remains.

## 2026-10-17 — Faster CI feedback

The preceding frontend-only fix spent 21 seconds in the app job but 17m53s in
engine validation: 13m31s in tests and 4m08s replaying published puzzles. CI now
skips the engine job on PRs containing only app/documentation changes, except
puzzle JSON. Engine, schema, conformance, CI and unknown paths require full
checks. Git diffs include removed/renamed inputs and the full tested PR merge;
missing history defaults to full validation. Main pushes and publisher/manual
dispatches always validate everything before deployment. This deliberately
preserves the deployment guard if an earlier main run failed.

Superseded PR CI runs are canceled; main runs remain independent. Routing has
six small stdlib tests using real temporary Git repositories and no new dependency.
Actionlint 1.7.12 checked the workflow, using a checksum-verified temporary tool.

Profiling the unchanged engine suite locally identified repeated trace-corpus
builds and unnecessary generation/replay inside verifier metadata tests. Reuse
one genuinely generated trace corpus and existing replayable puzzle fixtures;
assert error text from the first verifier call instead of replaying again.
The same 596 tests passed before and after: 330.46s versus 218.10s, a 34% reduction
in these single local runs. The 100-seed independent-solver check remains intact.
Production rules and archive bytes are unchanged; all existing test cases and
verifier checks remain. CI now reports
its slowest tests to guide any further work. Frontend PR wall-clock savings will
be confirmed by the next real frontend-only PR; this CI-changing PR runs the
engine deliberately. Main/deployment validation still takes time.

## 2026-10-18 — Give the boards their space

Train Tracks puts its timer, Undo/Reset and a compact three-column piece picker
beside the board at widths of 48rem and above. Phones retain the controls above
the board. The board's own 480px/48svh cap is replaced too: at 1280×900, a large
board grows from 432px to 612px wide, with cells increasing from about 31px to
46px. Tall rectangular boards still use their own aspect ratio to limit height.
The native radio group, keyboard controls and gesture handlers are unchanged.

Word Paths puts answer slots beside the board on wide screens and in one compact
row on phones. A shorter Clear/Submit row keeps the selected word and actions
together, with their full accessible names retained. Board sizing leaves room for
the answers, with a 16rem preferred minimum so small screens scroll rather than
squeezing five rows into tiny targets. Only this game's heading, toolbar and
notice spacing tighten on narrow screens; help and feedback remain in normal flow.

Browser checks against the production build confirmed the board, Submit and all
four answer boxes fit without scrolling at 375×667 and 390×744, including the
real offline-ready message. At 320×568 there is no horizontal overflow, letter
cells remain about 44px and the page scrolls vertically. The desktop Word Paths
layout also fits its answers and Submit at 1280×720. Tablet checks at 768×1024
found neither layout overflowing. Light/dark appearance, all three track sizes,
clue alignment, native vertical track dragging with one-step Undo, and Word Paths
keyboard selection, drag submission and Undo were checked in the browser.

[Large Train Tracks](images/tracks-sidebar-layout.jpg) ·
[Word Paths on a phone](images/word-paths-phone-layout.jpg)

All 611 app tests pass; app typecheck, lint and production build pass. Lint still
reports the existing `set-state-in-effect` warning in unchanged TracksStage code.
No new test dependency or markup-only tests were added for this layout change.
Physical iPhone/Safari touch, pinch zoom and increased text-size testing remain
unverified. Very short viewports, preview-page selectors and longer error notices
may still require scrolling. Puzzle rules, saved progress and engine inputs are
unchanged; archive, stats and rules navigation remain the next separate slices.

## 2026-10-18 — A compact archive for each game

The archive now shows one game's recent dates, selected by ordinary links at the
top. `#/archive?game=train-tracks` can be bookmarked and survives refresh and
browser Back/Forward. Missing or invalid selections use Queens. Puzzle pages'
All puzzles link returns to their own game's archive, including direct entries.
One loader keeps the discovered archive while game selections change, and ignores
late results after leaving the page.

Date rows keep the difficulty beside the date. Train Tracks uses one row per day
with only its published sizes; legacy boards retain their actual dimensions.
On phones, size names fit in one row while full dates, names and dimensions stay
in their accessible link labels. Links retain 44px targets. The content width is
bounded, and the selector becomes two columns on narrow screens.

Discovery scans all registered slots once per archive visit, then selects by the
parsed file's declared type. A valid Queens file with a `-star` filename must
remain visible under Queens. This restores the pre-existing discovery invariant;
game switches reuse the loaded results instead of starting more requests. The
legacy tracks slots, Word Paths launch gate and shared cache validation/fallback
remain. Opening the archive saves available recent boards across all games, as
stated in the Home Screen instructions.

All 615 app tests, typecheck, lint and production build pass. Existing discovery
and markup cases cover declared types, dates grouped once, legacy dimensions and
return links; three URL cases and one cross-family offline-discovery case were
added. Lint retains the existing warning in unchanged TracksStage effect code.

Browser checks covered 320px/390px phones, a 1280px desktop, light/dark appearance,
44px targets, no horizontal overflow, game switching, Back/Forward, refresh and
the puzzle return link. Review reproduced the hidden Queens file with the existing
mislabelled fixture. A temporary production-preview middleware then served a real
Queens file under `2026-10-03-star`: it appeared only under Queens. The initial
109 puzzle probes stayed at 109 after switching among three games. The archive
files were unchanged. Cache tests verify discovery across saved families after
failed requests; no physical iPhone airplane-mode test is claimed.

[Desktop archive](images/compact-archive-desktop.jpg) ·
[Phone archive](images/compact-archive-phone.jpg)

Per-game stats and rules navigation remain separate follow-ups. The archive
still uses the existing 30-day window; no search, pagination, index manifest or
new dependency was introduced.

## 2026-10-18 — Recent solves by game

Recent solves now uses the archive's game selector, with `#/stats?game=train-tracks`
as a bookmarkable selection. Invalid or missing selections use Queens. The list
filters by the recorded game before taking the ten most recently completed solves,
so another game's activity cannot push a selected game's history out of view.
Dates, solve times, track size names and hint counts remain visible. An unplayed
game has its own empty message while the history controls remain available.

The overview is explicitly labelled All games and keeps its existing totals,
streaks and aggregate timing. Clear all stats and its confirmation explicitly name
the global deletion scope; the storage and deletion functions are unchanged.
Archive and Stats share the renamed `game-picker` CSS, including 44px targets and
a two-column phone layout. The selected link retains its accent while hovered.

All 620 app tests, typecheck, lint and production build pass. Five focused cases
cover recorded-family filtering, filtering before the recent limit, an empty
selected game, and missing/invalid URL values. Lint retains the existing warning
in unchanged TracksStage effect code. No dependency or storage migration was added.

A production preview with disposable sample history confirmed stable all-game
totals across selections, empty-game feedback, browser Back, refresh, and the
all-game deletion wording followed by Keep them. Actual deletion was not repeated;
the existing storage tests cover it. At 320px and 390px, selectors retain 44px
height without horizontal overflow. Dark/light appearance and the archive's
shared selector were also checked. Physical iPhone testing remains unverified.

[Desktop stats](images/per-game-stats-desktop.jpg) ·
[Phone recent solves](images/per-game-stats-phone.jpg)

Dedicated rules sections and links from each game are next. Per-game aggregate
metrics and per-size comparisons are outside this recent-history change.

## 2026-10-18 — Game rules and direct navigation

How to play now starts with shared controls and a four-game jump list. Each game
has its own rules and controls, with Queens and Star Battle hints, marking notes and the Train
Tracks picker explained in their relevant sections. Install, offline and stats
information remains available below the games. Outdated claims about
filling every Train Tracks cell and cycling track pieces were corrected
against the actual controls; all four daily games are now described as available.

Loaded puzzle headings link to the parsed game's rules, including legacy Star
Battle pages. Links open a labelled new tab so consulting instructions does not
unmount unfinished Queens or Star Battle attempts. The Word Paths preview's
existing return link now points to its rules. HashRouter section links scroll and
focus the heading; the existing crosses and notes anchors remain valid.

All 621 app tests, typecheck, lint and production build pass. One new small test
covers every game's section link and the retained anchors; the preview test also
checks its direct link. Lint retains the existing TracksStage effect warning.
Browser checks covered all four in-game destinations, retained Queen/star moves,
refreshing a deep link, legacy anchors, dark/light appearance and 320px layout.
At 375×667, Word Paths answer slots end at 663px without horizontal overflow.
No physical iPhone test is claimed. Gameplay, puzzle assets, storage and engine
code are unchanged; no dependency or routing framework was introduced.

[Phone rules](images/game-rules-phone.jpg) ·
[Desktop rules entry](images/game-rules-desktop.jpg)

## 2026-10-18 — Trio three-symbol engine feasibility

Started the agreed 9×9 Tango-inspired variant under the working title Trio. Sun,
moon and star each appear three times per row and column; three identical symbols
cannot be consecutive horizontally or vertically. Adjacent same/different clues
apply literally: different leaves two alternatives. Diagonals and repeated rows
are allowed. The icon direction is amber sun, blue crescent and purple five-point
star; no interface or daily content is introduced in this engine milestone.

The isolated model checks givens and relation geometry. A candidate-rule solver
records direct count, no-three and relation deductions and stops when it stalls.
A separate exact solver filters balanced no-three row/column patterns at crossings
and branches on the smallest domain, counting at most two completions. Exhausting
its explicit branch budget raises rather than certifying a unique solution.
Sequential row search was too weak on some deduction-solvable boards, so pattern
intersection replaced it without reusing the deduction implementation.

The provisional SplitMix64 recipe creates a solution, selects 24 relations and
removes givens only while deductions finish. Redundant relations are then removed
and exact uniqueness is checked. Twenty seeds all succeeded: 22–30 givens and
5–15 relations, mean 0.169 seconds and maximum 0.174 seconds locally. The five
[stored samples](measurements/trio-pilot.json) include answers and readable traces.
Exact searches rejected all 544 alternatives removed in these traces. This proves
feasibility for the measured sample, not human difficulty or enjoyable play.

All 610 engine tests pass (229 seconds locally), including 14 focused Trio tests
that take approximately one second. Typecheck, lint and formatting pass. All 104
published puzzles replay and verify; the schema-ID check passes. A single fresh
review found no actionable issues and independently compared 24 seven-hole
positions with exhaustive completions. The larger seed probe is manual, outside
routine CI. No new dependency or CI, app, schema, published-content or saved-data
change was made. Frontend checks were left to existing GitHub CI for this
engine-only change; phone usability and difficulty remain for the playable preview.

Next steps: freeze the file/ID contract and cross-language fixtures, build the
preview with the agreed symbols, then playtest before enabling daily publication.

## 2026-10-18 — Playable Trio preview

The user reprioritized a playable test before engine-test optimization. This PR
therefore bundles the five verified pilot boards as answer-free preview data,
without registering an incomplete fifth daily family. Daily schema/ID integration
and freezing a publishing recipe remain after playtesting. No test or CI
optimization is included; the four daily games and their data remain unchanged.

The lazy `#/preview/trio?board=1` route is reachable from Today's Meet Trio entry
and its own How to play section. Each board has its own validated, fingerprinted
local snapshot of placed symbols, pencil notes and active time. Givens cannot be
changed. Notes are optional working and never count as placed symbols. Completion
checks the actual rules without a stored answer; preview solves never read or
write daily stats. Undo belongs to the current visit, as with the other previews.

Distinct SVG sun, crescent and five-point star silhouettes use amber, blue and
purple in light/dark appearance. A native radio picker and Notes toggle support
tap, drag, right-click erase and keyboard input. Pointer cancellation restores the
stroke; a committed horizontal or vertical drag is one Undo. The grid reserves
board touches for play and retains native pinch zoom. The full board fits at
375×667 (bottom 662px) and 320×667 without horizontal overflow. Very short screens
scroll to preserve readable cells. Board selection follows the game and returns
the viewport to the top when changed.

All 629 app tests, typecheck and the production build with the GitHub Pages base
path pass. Lint retains only the existing TracksStage effect warning. Eight small
cases cover the shared measured answers, rule violations, preview parsing,
givens/notes, snapshot validation and preview markup. All five exact bundled
inputs independently pass the existing Python deduction and uniqueness checks.
No new dependency or engine/schema/published-content change was made.

Browser verification covered symbol entry, notes, reset/Undo, reload and separate
board attempts, both drag directions with one-step Undo, rules focus, Today entry,
a complete keyboard solve and an unchanged daily-stats snapshot. The production
build opens directly under `/daily-puzzles/`, restores progress and reports App
ready offline. Physical iPhone touch/pinch and airplane-mode testing remain
unverified; no human difficulty rating is claimed.

[Phone preview](images/trio-preview-phone.jpg) ·
[Desktop preview](images/trio-preview-desktop.jpg)

Independent review caught mixed keyboard/pointer edits nesting a second move in
a held drag. Keyboard placement now waits until the stroke ends; Ctrl/Cmd+Z
cancels it before Undo. External Undo/Reset also preserve the active transaction.
A focused event-handler regression fails against the original code and passes
with the fix; the reviewer confirmed the correction.

## 2026-10-18 — Explained Trio hints

The preview now offers a logical hint without changing the board until Apply
move is pressed. A solid outline identifies the target; dashed outlines identify
supporting cells. The panel explains the rule and includes prerequisite
deductions when a move needs a chain of reasoning. Its location button returns
to the highlighted target on small screens. Escape/Dismiss returns focus to Hint.

A direct-rule TypeScript port reproduces all five committed Python pilot traces.
It reasons from placed symbols, never treats pencil notes as evidence, and checks
the full deduction pass for contradictions before offering a move. Applying an
elimination updates only that cell's notes to the remaining candidates. A forced
symbol uses the normal placement path. Both are one undoable move; existing
progress storage needs no migration. Edits, Undo and Reset clear stale hints.
As with manual play, completing the board locks editing and Undo.

Five focused domain cases cover elimination, equality chains, different clues,
misleading notes, indirect contradictions, stale application and all five pilots.
All 634 app tests pass; typecheck and the GitHub Pages build pass. Lint retains
only the existing TracksStage effect warning. Browser checks covered candidate
application and Undo, persistence, keyboard dismissal, target focus, stale-hint
removal and completion through a forced-symbol hint. At 320×667 and 375×667 the
initial board still fits without horizontal overflow; long explanations scroll.
The production build also opens directly under `/daily-puzzles/` to board 5,
applies a candidate hint and restores it after reload. Independent review found
no material issues. Physical iPhone and airplane-mode checks remain unverified.

Queens/Star Battle explanation improvements and Train Tracks hints follow this
Trio slice. Word Paths stays last. No daily publishing, stats, dependency, engine
or CI changes are included.

[Phone hint](images/trio-hint-phone.png) · [Desktop hint](images/trio-hint-desktop.png)

## 2026-10-19 — Daily Trio and archive backlog

Promoted the playtested Trio rules and explained hints into the existing daily
pipeline. The fixed 9×9 recipe is frozen as version 1, with no difficulty label.
The shared schema and both readers enforce the canonical date-trio identity,
81 givens and ordered adjacent same/different relations. Answer fields, unknown
versions and difficulty claims are rejected. A frozen pilot digest guards replay.

Added 27 new answer-free files, September 26 through October 22. Each was
regenerated from its recorded seed, independently counted as unique and completed
by direct deduction. Existing files from the other games were not rewritten.
The dated activation gate makes the backlog visible through today while keeping
future files out of the archive. The existing daily publisher maintains new slots
and skips these already published Trio files.

Daily Trio now appears on Today and in Archive, Stats and sharing. Daily progress
uses a separate storage prefix and persists shown hints; preview keys and daily
results stay independent. First-solve time and hint count win over replays,
including shared results. A hint that finishes the board announces completion
instead of promising Undo after the completion lock. The fixed-size caption is
omitted on narrow daily screens so the ninth row remains visible.

All 665 app tests and 648 engine tests pass. Typecheck and the GitHub Pages build
pass; Python lint/format/type checks are clean. App lint retains only the existing
TracksStage warning. Shared fixtures exercise structural and semantic rejection.
Browser checks covered Today's dated link, the 24 released archive dates, hint
notes and reload, final hint completion, Stats filtering, first-result sharing on
replay and spoiler sharing. The board fits at 320×667 and 375×667; offline update
activation was exercised by closing old tabs. Physical iPhone and airplane-mode
checks remain unverified. No dependencies or CI settings changed.

[Daily phone board](images/trio-daily-phone.png) ·
[Today's lineup](images/trio-daily-today.png)

## 2026-10-19 — Reduce repeated engine-test work

The daily Trio PR's GitHub engine job took 14m 33s: 9m 24s for tests and
4m 51s for full archive verification. This change targets test work without
removing correctness checks or changing CI/deployment routing.

Hint tests now build their real corpus once, with deep copies for corruption
and CLI cases. Registry shape/render checks share immutable generated samples;
replay still invokes the real generator. Publishing-window tests reuse identical
Star Battle generation within their class while retaining real file writes,
resume logic, seed retries and layout checks. The stars-per-row replay check
uses an 8×8 board; default 9×9 generation and replay remain covered elsewhere.

Profiling the 100-seed Word Paths test found repeated vocabulary validation
dominated its runtime. Equivalent native ASCII/alphabetic/uppercase predicates
replace the Python character loop. The full vocabulary is still validated at
each call; no production cache or skipped validation was added. Five inexpensive
rejection cases cover Unicode, digits, trailing newline and length bounds. A
manual sweep checked every Unicode code point against the ASCII A–Z boundary.

All 653 engine tests pass in 135.98s locally, versus 648 tests in 222.63s before
(39% less time). The same 100-seed independent-solver/replay test drops from
37.37s to 21.05s. Pyright, Ruff lint/format and schema-ID checks pass. A fresh
independent review found no actionable issues. These local timings are not a
promise about GitHub runner performance; compare the PR's actual run before
considering further CI changes. Puzzle recipes, archive files and player data
are unchanged.

## 2026-10-19 — Compact Today and more room for Trio

Today's heading now shares its first desktop row with the date. Smaller motif
tiles sit beside game names. Every card uses ordinary grid placement, so adding
a sixth game fills the second row instead of opening an unnecessary third row.
Train Tracks keeps three full-width size choices; every label stays on one line.
The first row grows to fit those choices: at 1280×800, all five unplayed cards
end at 767px. Shorter screens can scroll. Phones retain full-width choices and
a single-column layout.

Removed the sticky header's decorative fade: it extended over the offline
status text and made the first line look clipped. No extra header height was
needed. Desktop Trio reuses the side-control pattern from Train Tracks; at
1440×900, its board grows from 500px to 612px wide and all nine rows fit.
Below 48rem the original controls-above-board layout remains.

All 665 app tests and the TypeScript/production build pass. Lint retains the
existing TracksStage warning. Production browser checks cover 320×667,
375×667, 768×900, 1024×768 and 1440×900 layouts, notes, Undo, keyboard placement,
hint application, light mode and the offline status. A fresh independent review
found no actionable issues. No new tests or dependencies were added for these
presentation changes; no rules, hints, publication or saved data changed.
Physical iPhone/Safari testing remains unverified. Train Tracks still has no
deduction hint engine; adding explained hints remains separate work.

[Compact Today](images/compact-today-desktop.png) ·
[Trio side controls](images/trio-side-controls-desktop.png)

## 2026-10-19 — Redo and confirmed resets

All five games now offer Redo. Ctrl/Cmd+Shift+Z and Ctrl/Cmd+Y redo from the
board; a new committed move clears the redo branch. Drag gestures remain one
history step. A shared history hook retains the most recent 100 states for the
current visit, preserving the existing lifetime of Undo. Word Paths can also
undo and redo accepted words restored from saved progress.

Reset asks for native browser confirmation before changing anything. Cancel
preserves the board and its history; confirming creates one undoable reset.
The timer keeps running and completed puzzles remain locked. Trio's mobile
toolbar spacing accommodates the extra button without shrinking touch targets.

All 670 app tests, TypeScript and the production build pass. Lint retains the
existing TracksStage warning. Regression checks cover repeated Undo/Redo,
branching, the 100-state limit, confirmation cancellation and reset recovery.
Production browser checks exercised Redo in all five games and Word Paths
recovery after reload; Trio's six toolbar entries fit at 320px. An independent
review found no actionable issues. Native confirmation opened but blocked the
automation browser; the user dismissed it by confirming Reset, and the cleared
board was observed afterward. Automated native-dialog acceptance/cancellation
and physical iPhone testing remain unverified; handler behavior is unit tested.
No dependencies, engine rules or saved-progress formats changed.

[Trio history controls](images/trio-redo-desktop.png)

## 2026-10-19 — Explain Queens and Star Battle deductions

Queens and Star Battle now use Trio's explain-then-apply interaction. The hint
engine captures the groups, remaining piece counts and supporting cells at the
rule that finds the move. Explanations cover singles, filling a group,
intersections and subsets, including regions and lines needing multiple stars.
The deduction order and selected moves remain pinned by the existing shared
conformance fixtures and full hint baseline.

Solid target and dashed support outlines distinguish the move from its evidence.
The shared HintPanel focuses its explanation, supports Escape/Dismiss, and offers
a location button to return to the target on phones. Timer renders preserve
focus. Apply move places a piece or adds one cross through normal history and
solve handling; Undo/Redo restores it until solved. Edits and gestures dismiss
stale hints. The panel states that these games use player crosses as exclusions;
it does not claim to validate them against a solution. A stalled rule pass no
longer suggests that the player needs to guess.

All 677 app tests, TypeScript and the production build pass. New regression
checks exercise explanation evidence and remaining counts, requesting without
editing, applying an undoable move in both games, and hint-assisted completion
with stats. Lint retains the existing TracksStage warning. Independent review
caught support outlines hiding keyboard focus; a separate solid focus outline
fixes that, verified in the browser. Browser checks also cover desktop,
375×667 and 320×667 layouts, light/dark themes, location and Escape focus,
Apply/Undo/Redo, stale cleanup and Trio candidate-note hints after the shared
panel extraction. Physical iPhone/Safari testing remains unverified. No engine,
published puzzle, dependency or saved-data changes; Python tests were not rerun.
Train Tracks deductions remain the next separate milestone.

[Desktop explanation](images/star-explained-hint-desktop.png) ·
[Phone explanation](images/star-explained-hint-phone.png)

## 2026-10-19 — Count undecided Train Tracks cells

The ? marker now reserves track space when checking row and column clue limits.
Shaped tracks and ? cells share that tally, while crosses remain excluded. An
overfilled line highlights its editable occupied cells, including ? markers;
givens stay fixed. Direction, connection and path checks still require a shaped
track. Every ? must be resolved before the route can finish, so an otherwise
complete route with extra ? cells is no longer accepted. Rules and status text
describe the distinction. The marker's appearance is unchanged.

All 680 app tests, TypeScript and the production build pass; lint retains the
existing TracksStage warning. Three focused regression cases cover both axes,
mixed track/? occupancy, clearing an overfill, clue equality without invented
direction conflicts, and completion versus leftover crosses or ? cells. An
independent review found no actionable issues. Production browser checks show
one given plus three ? cells meeting a clue of four, a fourth ? triggering the
warning, Undo/Redo clearing and restoring it, persistence after reload, and a
column overfill caused by two ? cells. Physical iPhone testing was not repeated.
No engine, saved-format, puzzle-content or dependency changes were needed.

[Undecided cells overfill a row](images/tracks-undirected-counts.png)

## 2026-10-19 — Explained Train Tracks hints

Train Tracks now offers count, connection and edge deductions in the shared
HintPanel. Cell domains represent empty or one of six shapes; ? fixes occupancy
without choosing a direction. Row/column bounds and reciprocal ends narrow those
domains to a fixed point. Contradictions anywhere in that pass suppress hints.
The first deduction expressible as a cross, ?, or forced shape is offered with
its earlier supporting deductions and distinct target/support highlights.

Apply move uses normal history and solve handling. H opens hints, Escape returns
to Hint, and the location button focuses the target. Edits and gestures clear
stale explanations; source identity prevents applying an old hint. Shown hints
are retained through Undo/Redo and Reset, saved with the attempt, and included in
the first solve and share text. An absent hint count in a legacy v1 snapshot means
zero. Player tracks, ? cells and crosses are assumptions, disclosed in every hint.
There is no search or global loop/path reasoning, and a stalled rule pass does
not claim that guessing is required. Generator guarantees are unchanged.

All 688 app tests, TypeScript and the production build pass. Tests cover occupancy
and shape hints, causal evidence, contradictions, stale application, history,
completion/statistics/sharing and compatible progress restoration. Lint retains
the existing TracksStage effect warning. Independent review caught an omitted
assumptions note for ? hints and obsolete rules text; both were fixed and checked.

An offline oracle exercise used the Python exact solver on seven published boards
(7×7, 8×8, 10×10 and 12×12), each from three correct starting positions. All 1,644
proposed moves and 4,141 supporting restrictions preserved the independent solution.
Four traces finished and 17 stalled, demonstrating the limited scope. Answers and
the temporary oracle runner were not added to the app or default test suite.

Production browser checks cover desktop, 375×667 and 320×667, light/dark themes,
H, location/escape focus, timer focus stability, Apply/Undo/Redo and reload. Applying
a final forced shape completed a real 8×8 board; Stats recorded all six shown
hints across reload. Physical iPhone/Safari testing remains unverified. No new
dependencies or published puzzle files; the full Python suite was not rerun.

[Phone explanation](images/tracks-hint-phone.png)

## 2026-10-19 — Progressive Word Paths hints

Word Paths now reveals a starting cell for a remaining word, then one additional
letter and position per request. The bounded client search uses the board's
frozen vocabulary and finds a complete cover while keeping accepted words fixed.
It ignores an unfinished trace and never changes or submits it. An exhaustive
dead end recommends Undo; reaching the search budget makes no such claim.

The existing HintPanel has a word variant, with numbered bottom badges on the
board distinct from current trace order. H opens or returns to the panel;
location focuses the start and Escape returns to Hint. Accepted words and
Undo/Redo/Reset clear stale hints. Reveals count individually and survive these
actions and reload, with legacy snapshots defaulting to zero. Counts reach
first-solve stats and shares; preview attempts remain separate. Phone controls
stay on one row without reducing their touch height.

All 698 app tests, TypeScript and the Pages production build pass. Lint retains
the existing TracksStage warning. Ten focused tests cover viable completions,
dead ends, vocabulary versions, high cell indices, budget exhaustion, progressive
reveals, trace preservation, history, persistence, solve/share counts and reversed
trace numbering. Independent review caught ambiguous numbering and missing
keyboard focus indication; both were fixed and the reviewer verified the fixes.

A temporary oracle compared 691 positions across 28 daily, original and expanded
preview boards with the independent Python reference cover solver. Every hint
preserved a reference completion, and 131 dead ends were recognized correctly.
Cold search took 4.4 ms on this Mac; the 691 calls totalled about 11 ms. The
runner and answers were not added to the repository or default suite.

Production browser checks cover desktop, 375×667 and 320×667, light/dark, H,
location/Escape, independent trace/hint order, and a full daily solve. Stats kept
all 21 reveals through reload and Undo/Redo. A legal but stranding preview word
produced the expected dead-end message. Physical iPhone/Safari performance is
unverified. No dependencies, puzzle content or Python code changed; the full
Python suite was not rerun.

[Phone word hint](images/words-hint-phone.png)


## 2026-10-20 — Free anonymous leaderboard backend

The approved first slice adds a transactional Supabase migration, restricted
ranking/submission/deletion functions and a trusted metadata importer. Public
reads expose display fields only; ownership comes from Auth, first scores are
immutable, and a separate counter survives removing results. Equal hints/time
share competition rank; exact puzzle IDs keep Train Tracks sizes separate.

Five Node importer tests, seven CI routing tests and disposable PostgreSQL 17
contract/concurrency checks pass. Independent review repeated the SQL contract
with Supabase-style default grants and found no blocking issues. One minor is
deferred: the concurrent test could bind each returned status to its retained
score, rather than accepting either first writer. The implementation serializes
both writes correctly. All 137 committed puzzle files validate as metadata.

Catalog synchronization is optional and main-only. Failures warn and allow
Pages publication to continue, so a paused Free project cannot stop new puzzles;
rankings can remain pending until the next successful sync. The setup guide
keeps server keys outside the app and records Free-plan/CAPTCHA configuration.

No provider project, credentials or paid plan was created. Actual hosted Auth,
CAPTCHA and gateway behavior remain a two-session launch gate. Frontend opt-in,
queues, accessibility and offline checks belong to the next app slice; this PR
alone does not expose a leaderboard. Scores remain community-reported and
anonymous identities cannot prevent identity farming. Unchanged Python engine
checks run in GitHub rather than being duplicated locally.

## 2026-10-20 — Optional leaderboard app integration

The app now uses the official Supabase SDK for anonymous sessions, with explicit
joining and consent. First daily/archive solves feed an owner-bound pending
queue; previews and earlier history do not upload. Exact-puzzle rankings appear
on solved screens and a new navigation page. Players can stop publishing or
confirm removal of their own results. Failure to reach the provider does not
block play or local Stats.

All 731 app tests, TypeScript, seven CI-routing tests and the Pages build pass.
Lint retains the existing TracksStage warning. The configured bundle contains
the expected public settings and no secret-like tokens. The SDK increases the
main bundle to about 746 kB (222 kB gzip), triggering Vite's size advisory.

Hosted setup now permits anonymous Auth, and the maintainer reports Turnstile
protection configured. Catalog import succeeded; public rankings return an
empty board for a real puzzle and direct result-table reads are denied. Rerunning
an old deployment produced duplicate Pages artifacts; a fresh main workflow
completed successfully. After resolving the temporary localhost authorization,
two real browser identities completed managed Turnstile verification and
published the same Queens puzzle. Scores retained their own time and hint
counts, ranked correctly, and identified only the current player. Owner-only
removal preserved the other score; both test scores were removed with approval.
Tie ranks and the owner outside the top 25 use the SQL/app contract checks.

Independent review found five lifecycle problems: cross-tab queue updates could
undo Stop, delayed uploads could outlive deletion in another tab, the SDK could
fall back to memory storage, initial session restoration could lose a solve,
and a new owner's candidate could stall behind an old drain. Five regression
tests reproduced these failures before fixes. Shared Web Locks now serialize
queue changes and network writes/removal; SDK persistence uses the explicit
browser storage adapter, and restoration/owner transitions retain queued work.
No second review was commissioned; the fixed tree passes the full app suite.
The subsequent GitHub review found a delayed cross-tab join event could still
discard a first solve. A sixth regression test reproduced it; enqueue now reads
the owner inside the lock and refreshes a stale SDK identity before validating it.
Critical review of that fix found the same stale cache still dropped a solve
when another tab re-enabled publishing before the enable event arrived, and a
rejected session read was reported as a storage failure. Seventh and eighth
regression tests cover the re-enable window and a failed identity read; enqueue
treats the participation loaded under the lock as authoritative, and identity
verification treats a failed read as no identity.

Browser checks cover desktop, 375 px and 320 px, light/dark, visible keyboard
focus, exact Train Tracks size links, and a complete solve with the provider
unreachable. That solve remained in local Stats. Physical iPhone/Safari testing
of this feature is unverified. No puzzle content, schema or Python code changed;
the engine suite is left to GitHub. The optional service activates only after
the app PR is merged and the trusted main deployment completes.

## 2026-10-20 — Resume Queens and Star Battle attempts

Unfinished Queens and Star Battle boards now survive reloads. `lib/marksProgress.ts`
stores pieces, crosses, shown hints and elapsed milliseconds under
`daily-puzzles.marks-progress.<id>`, behind a version and board fingerprint. Reads
reject a different board, family or puzzle ID, malformed cells, overlaps and bad
durations; a solved snapshot is cleared. The stage restores the clock from the
saved duration and flushes on moves, hints, undo/redo, visibility change, page
exit and unmount. Undo history deliberately starts empty. Storage denial leaves
play available and uses the existing warning treatment.

All 752 app tests, TypeScript and the Pages production build pass. Lint retains
the existing TracksStage warning. New tests cover both families, round trips,
board/family/ID isolation, the legacy hint default, malformed snapshots, solved
cleanup, unavailable storage, a restored four-queen board that finishes with its
saved hint count, and the page-exit flush. The main bundle is 748.0 kB (222.4 kB
gzip), up from 745.6 kB because of the new module.

A real-browser reload and page-exit check was not run in this environment; the
DOM-free stage harness executes restore and solve paths, and the page-exit test
runs the actual effect with stubbed browser globals. No puzzle content, schema or
Python code changed.

## 2026-10-20 — Roll the day over at local midnight

`useToday` now owns the player's current puzzle day for the landing chooser,
archive, stats, leaderboards and the Star Battle shortcut. It seeds from
`puzzleOfToday`, schedules the next local midnight, and rereads the clock on
visibility, focus and pageshow for throttled tabs and bfcache restores. Each
refresh resolves the browser's current time zone again, so moving the device
across zones cannot advance the day at the old zone's midnight. Home and Archive
tag fetched results with the day they belong to, so a rollover shows the loading
state instead of yesterday's cards under the new date.

All 755 app tests, TypeScript and the Pages production build pass. Lint retains
the existing TracksStage warning. Three hook tests cover the midnight timer,
throttled visibility/focus/pageshow recovery, and a device time-zone change before
the timer fires, including timer and listener cleanup. The main bundle is 748.5 kB
(222.5 kB gzip). No new dependencies, puzzle content, schema or Python code
changed. A real-browser overnight check was not run; the hook tests use fake
timers and stubbed browser globals.

## 2026-10-20 — Split routes and defer the leaderboard client

Every non-landing route is now a lazy chunk, and the leaderboard provider sits
behind a pathless gate around the puzzle, Star Battle and leaderboard routes.
Home, Archive, Stats and Rules no longer mount a provider, and Supabase is no
longer in the entry or their route chunks; the play screen and leaderboard load
the 222.5 kB SDK chunk when they need it. The entry chunk falls from 748.5 kB to
427.9 kB (222.5 kB to 134.7 kB gzip), and the 500 kB build warning is gone.

The gate starts the matched page import while the provider chunk is still loading,
so those two requests overlap. Remounting the singleton store re-reads shared
participation instead of trusting a stop observed before the gate unmounted.

All 757 app tests across 60 files, TypeScript and the production build pass; lint
retains the existing TracksStage warning. The new jsdom integration test renders
App and navigates between ungated and gated routes, covering provider placement
and lifetime; a store test covers a missed cross-tab stop. jsdom is a dev-only
dependency. The offline worker precaches the new lazy chunks, so route code is
still available offline after install; the SDK may arrive in that background
install but is not parsed until a gated route mounts it. No puzzle content,
schema or Python code changed. A real-browser navigation check was not run.

## 2026-10-20 — Page the archive past 30 days

The archive now pages backward in 30-day windows. **Older** and **Newer** move
between windows, and each window is discovered by probing only its own files, so
older committed puzzles stay reachable without an index manifest and without
re-probing the latest page. `listPublishedPuzzles` takes an `olderDays` offset;
malformed offsets fall back to the latest window.

The selected page lives in the archive URL (`?game=queens&page=2`), and puzzle
links carry it through the puzzle route, so refresh, browser Back and the puzzle
page's All puzzles link all return to the same window. The loaded result is
tagged with the day and page, so a rollover or page change shows loading until
the requested window lands.

All 763 app tests across 62 files, TypeScript and the production build pass; lint
retains the existing TracksStage warning. A jsdom integration test clicks Older
and Newer and asserts the URL, offset and returned links; a loader test proves
the older window's newest day is one day older than the latest window's oldest
day and does not probe the latest day. The date helper applies the offset to its
cursor, so a deep page still formats only 30 dates. The entry bundle is 428.0 kB
(134.8 kB gzip); the shared archive URL helper is a 0.26 kB chunk. No new
dependencies, puzzle content, schema or Python code changed. A real-browser check
of the pager was not run.

## 2026-10-20 — Finish the cleanup batch

The offline status line now announces a waiting service-worker update instead of
leaving it silent until every window closes. Registration reports a worker that
is already waiting or finishes installing while the app is open; activation stays
on the normal waiting lifecycle, so no board is reloaded mid-game.

Stats can be exported as a JSON backup and merged back on another browser. Import
validates every record, rejects an id that names a different family, migrates
repurposed ids before de-duplicating them, and keeps the earliest solve for each
puzzle id. Import is available with an empty
history; export appears once there is something to save. The two-step clear flow
remains.

A new scheduled `monitor-publish.yml` runs six hours after the nightly publisher
and calls `tools.publish --check`. The check reads `main`, reports the first
incomplete day from the archive's fixed start through the lead horizon and
exits non-zero without writing. It
catches a publisher or commit that failed after the workflow's local tree looked
healthy. The stale leaderboard activation wording was corrected separately on
`main`.

All 774 app tests across 62 files, TypeScript, lint and the production build pass;
lint retains the existing TracksStage warning. The entry bundle is 428.6 kB
(135.0 kB gzip), and the Stats chunk is 5.1 kB. The engine suite passes 656 tests;
pyright, ruff and published-archive verification pass. `publish --check` reports
the committed archive complete through 2026-10-23. No new dependencies or puzzle
content changed. A real-browser service-worker update and file-picker flow were
not run; the tests cover waiting/install detection, the notice text, import
validation and merged storage.

## 2026-10-20 — Clear Trio notes

Trio has a Clear notes button for daily and preview boards. It removes all pencil
marks, preserves givens and placed symbols, dismisses any stale hint and saves
the change as one Undo/Redo step. Empty and solved boards disable the control;
an empty action does not discard redo. The button sits beside the mode text on
phones and beneath it in the desktop sidebar, keeping the main toolbar compact.

All 777 app tests, TypeScript and the production build pass; lint retains the
existing TracksStage warning. Three new stage cases cover daily/preview saving,
symbol preservation, gesture protection, Undo/Redo and empty-action behavior.
Browser verification covers clearing notes, Undo/Redo, persistence after reload
and desktop/phone layout. No dependencies, puzzle content or Python code changed.

## 2026-10-20 — Playable Tents preview

Three 8×8 Tents boards are available from Today and How to play, with a lazy
preview route. Tents cannot touch, line counts must match, and the final layout
must admit a one-to-one orthogonal tree pairing. A tent may border several trees;
the checker finds a matching rather than requiring exactly one adjacent tree.
An isolated Python row-pattern counter proves one distinct tent placement for
each board; alternative pairings do not count as alternative solutions.
Search exhaustion raises instead of certifying uniqueness. No daily family,
shared schema, publisher, Stats or leaderboard changes are included.

Tent, Grass and Erase brushes work with tap/drag and keyboard controls. A whole
stroke, explained hint or confirmed Reset is one Undo/Redo move. Cancelled strokes
restore the starting state. Attempts save separately per preview with active
time and shown-hint counts. Direct hints explain adjacency, non-touching and
line-count deductions, highlight target/support cells and offer Apply move.
All three boards finish through these rules; every suggested move is compared
with the independent Python answer in tests. Grass marks are assumptions, not
validated notes. No difficulty rating or general logic-only generator promise.

All 790 app tests and 665 engine tests pass. TypeScript, pyright, ruff, formatting,
production build and all 144 published-puzzle replay checks pass; app lint keeps
only the existing TracksStage warning. The nine new Python cases take about
0.1 s locally; verifying the three previews takes about 1 ms. The preview is a
16.3 kB lazy chunk (6.3 kB gzip), with no new dependencies. Independent review
found no issues and cross-checked the counter against small brute-force boards.

Browser checks cover desktop and 320/375 px, light/dark/Auto, keyboard completion,
vertical painting and one-step Undo, hints, reload and separate board attempts.
With the preview server stopped, cached reload, Stats, Archive, rules and Tents
navigation still work. Phone gesture cancellation is covered by DOM tests;
physical iPhone playtesting remains for the maintainer. The local preview server
was restarted after this check. [Phone preview](images/tents-preview-phone.png).

## 2026-10-20 — Parallel engine CI

The engine's test suite and published-archive replay now run as two matrix jobs
on separate GitHub runners. Dependencies and check commands are unchanged;
`fail-fast: false` lets both finish for useful diagnostics. The existing `engine`
check name is retained as an aggregate gate, so deployment still requires both
checks and successful routing. Failed, cancelled or unexpectedly skipped engine
work cannot produce a green gate; known frontend-only PRs skip engine work as
before. Main and publisher dispatches still run every check.

The sequential Tents PR run spent 4m18s on tests and 4m11s on archive verification
within an 8m46s engine job. Parallel execution targets that accumulated wait;
actual timings depend on runner availability and are reported in the PR.
This changes elapsed waiting rather than reducing the verification work, and
adds a second runner plus a short aggregate job.

Local proof uses actionlint, the seven existing routing tests and nine executions
of the aggregate gate extracted from the workflow, including failure,
cancellation, unexpected skips and missing routing data. No application code,
puzzle files, dependencies, permissions or verification checks change.

## 2026-10-20 — Three more challenging Tents previews

Append Boards 4–6 using seeds 148, 866 and 916. All row/column clues are nonzero;
each board has one immediately forced tent from singleton tree choices or a line
needing all its remaining candidates, compared with two in each original board.
After these opening exclusions, 31/30/31 cells remain eligible for tents, compared
with 23/27/25 originally. These are selection signals, not a difficulty rating.
The maintainer's playtesting decides whether the batch feels challenging enough.

The original three board definitions and their save fingerprints are unchanged.
Today links straight to Board 4; all six remain in the selector. The isolated
generator now reproduces these six curated seeds rather than replacing the
batch with the first three unique candidates. Answers remain in test-only proof
data. Every board has an independently verified unique tent placement and solves
through the existing explained hints without guessing. No daily publication or
hint rule changes are included.

All 790 app tests, nine focused engine tests, production build, pyright, ruff and
format checks pass; app lint retains its existing TracksStage warning. Existing
hint tests now replay all six boards, without a new CI seed sweep. Independent
review found no issues. Browser checks cover Boards 4–6, Today navigation,
save/reload, hint application and Undo, plus the 375 px layout.
[Phone preview](images/tents-challenge-phone.png). Physical iPhone playtesting and
subjective difficulty remain for the maintainer; full engine/archive checks run
in GitHub CI.

## 2026-10-20 — 10×10 Tents playtest

The maintainer solved all six 8×8 previews without hints, with clean attempts
under four minutes. Append Boards 7–9 at 10×10, with 18 tents each, nonzero clues
and seeds 140, 321 and 733. All six existing board objects, IDs and save
fingerprints are unchanged. Today opens Board 7; the selector lists dimensions
beside every board. The existing rules, progress, controls and clock are reused.
Only the parser, grid columns and labels needed dimension changes.

Selection deliberately no longer requires basic hints to finish. Each new board
starts with no forced tents from singleton trees or lines needing all remaining
candidates. Exact counting proves one tent placement per board. A throwaway
offline probe also completed them without branching, using deductions common to
all feasible row/column patterns: exact totals, non-touching, partial matching
and retaining a possible tent beside every tree. It took 4/5/6 propagation passes;
this is selection evidence, not a human difficulty rating or new runtime solver.
The current hints honestly stall after the obvious grass marks; their logic is
unchanged and their individual moves remain checked against independent answers.

All 794 app tests, ten focused engine tests, build, pyright, ruff and format
checks pass; app lint retains the existing TracksStage warning. New coverage
checks 10×10 boundaries and mixed-size selection, and reuses the existing playing
tests for 100-cell saves, Undo/Redo, Reset, keyboard movement and completion without
daily Stats. No seed sweep enters CI. Independent review found no issues and
cross-checked the counter against 1,447 small brute-force boards.

Browser checks cover Boards 7–9, the existing 8×8 board, Today navigation,
reload, keyboard movement and phone vertical painting as one undoable move.
Desktop 1280×900 and phone 375×812 / 320×667 layouts fit without horizontal
overflow; light and system appearance work. [Phone preview](images/tents-10x10-phone.png).
Physical phone usability and actual difficulty remain for playtesting. No daily
publishing, new hint features or dependencies are included.

## 2026-10-21 — Daily Tents

The maintainer selected 10×10 for daily play after testing both preview sizes.
Tents now uses the existing daily registry, publisher, monitor and replay path:
one `YYYY-MM-DD-tents` board per day, with no difficulty label. A frozen v1
recipe certifies 18 tents, nonzero clues, no singleton-tree or full-line opening,
completion by offline line-pattern propagation without guessing, and exactly
one tent placement. The browser's smaller hint engine is unchanged and may stall.

The launch backlog contains 29 boards from September 26 through October 24.
All were regenerated and checked for unique placements; their solution layouts
are distinct. Generation plus replay took under a second locally. All 144 prior
puzzle files and all nine preview definitions remain byte-for-byte unchanged.
Preview and daily saved attempts use separate keys while retaining the original
preview fingerprints. Today, Archive, Stats, sharing, offline play and optional
leaderboards use the normal daily flow; only the first solve counts.

Leaderboard migration 002 expands only the three existing family checks, without
changing permissions, RPCs, rankings or scores. It must run in Supabase before
main deployment synchronizes the new catalog. Clean installation, populated
upgrade, repeated migration and concurrent first submissions passed on disposable
local PostgreSQL 18.6. Docker PostgreSQL 17 is left to the existing CI job.
Rollback keeps the expanded checks and data and redeploys the previous app.

All 709 engine tests, 819 app tests and five catalog tests pass, alongside replay
of all 173 published puzzles, build, pyright, ruff, formatting and schema-ID checks.
App lint retains its existing TracksStage warning. Independent review found no
issues and checked exact counting/propagation against 154 small brute-force cases.
Browser checks cover daily completion, sharing, the Tents Stats filter, archive
navigation, replay, saved reload, desktop/phone layout and cached reload with the
server stopped. [Today](images/tents-daily-today.png),
[phone board](images/tents-daily-phone.png). Live Tents leaderboard publication
and physical iPhone play remain unverified until deployment and playtesting.

## 2026-10-21 — Check entries before Queens and Star Battle hints

A misplaced star can pass local conflict checks while preventing completion.
Hint now checks the board's unique solution independently of player entries,
offering removal of one misplaced piece before clearing one cross that blocks
a required piece. Only then does it run the existing explained deduction rules.
Corrections explicitly identify the solution check, highlight one cell and use
the ordinary Apply/Undo/Redo path. Shown corrections count and persist as hints.
Ordinary play still only flags local rule violations.

The browser computes and caches the solution on first Hint, using a bounded row
search that stops at two solutions. Ambiguous, impossible or unfinished searches
produce no accusation or deduction. No answers are added to published files;
the shared deduction/conformance contract and all other games are unchanged.

All 826 app tests pass, including correction priority, no premature board edit,
undo/redo, persistence and failed verification. Build/typecheck pass; lint has
the existing TracksStage warning. Independent review found no issues. The new
solver matches Python's exact solver on all 56 published marks boards, with a
slowest local first check of about 2 ms. Browser checks cover wrong-star and
wrong-cross correction, Undo/Redo, saved reload and subsequent deductions at
desktop and 393px phone widths. See [desktop](images/star-hint-correction-desktop.png)
and [phone](images/star-hint-correction-phone.png). Physical iPhone timing and
the unchanged Python suite were not rerun for this app-only change.

## 2026-10-21 — Reveal mistakes in stages

Queens and Star Battle now warn about contradictory entries without identifying
a cell. Players can dismiss the warning and keep solving, choose Show the mistake
to reveal one highlighted correction, then Apply move to clear that cell.
The general warning is free; revealing the correction counts and immediately
saves one hint. Board edits, Undo/Redo, gestures and dismissal clear the warning.
Escape returns focus to Hint. Ordinary deductions and all other games retain
their existing behavior; the exact solution verifier is unchanged.

All 828 app tests, build and typecheck pass. Lint retains the existing TracksStage
warning; independent review found no issues. Browser checks confirm no target,
location or Apply button before reveal, keyboard dismissal/focus, clearing a
warning by editing, reveal without applying, correction Undo/Redo, and normal
deductions after correction. See the [Star Battle desktop warning](images/mistake-warning-desktop.png)
and [Queens phone warning](images/mistake-warning-phone.png). Physical iPhone and
screen-reader testing were not performed.

## 2026-10-21 — Explain stronger Tents deductions

Tents hints now compare the possible arrangements of one row or column, keeping
its count, non-touching tents, distinct-tree pairings and an available tent for
every tree. A cell used in every arrangement is a tent; one used in none is grass.
The panel explains the constraints, lists positions when there are at most four
arrangements, and highlights the line and supporting evidence. Impossible lines
produce the existing general contradiction warning before any suggested move.
Basic deductions retain priority. No generator, puzzle or saved format changes.

All 833 app tests, build/typecheck and diff checks pass. Lint retains the existing
TracksStage warning. Independent review found no issues. A one-off probe compared
all suggested moves with independently computed Python solutions on 38 preview
and published boards: hints completed all 38, versus six with the previous rules.
Another 608 valid partial positions produced no incorrect hint or false warning.
The slowest measured hint call was under 1 ms on this laptop; the broad probe is
not added to CI.

Browser checks cover explanations and highlights, Apply/Undo/Redo, saved reload,
target focus, Escape focus restoration and a 393px layout without horizontal
overflow. See [desktop](images/tents-line-hint-desktop.png) and
[phone](images/tents-line-hint-phone.png). Physical iPhone and screen-reader
testing were not performed; the unchanged engine suite was not rerun.

## 2026-10-21 — Resume from Today

Today now shows Resume with the saved elapsed time for unfinished daily attempts
across all six games. Each Train Tracks size has its own status. Completed results
retain Play again/Solved even if an unfinished replay exists. The same progress
readers used by gameplay reject stale boards and invalid saves; blocked storage
or failed module loading leaves Play available. No progress formats, puzzle data,
game logic or leaderboard behavior changed.

Progress readers load after the cards appear so full Word Paths validation stays
out of the initial bundle. The entry is 437.5 kB (137.5 kB gzip), compared with
432.8 kB before this change; direct imports would have made it 564.2 kB. A minimum
card width prevents the longer Train Tracks action wrapping at narrow desktop
widths: three columns at 1280px, two at 900px, and one on phones.

All 837 app tests, build/typecheck and diff checks pass. Four new integration tests
exercise real save readers, all six games, per-size status, solved replay priority,
stale saves, blocked storage and zero-time attempts. Lint retains the existing
TracksStage warning; independent review found no issues. Browser checks cover
Queens and Train Tracks Resume navigation, restored moves after reload, and
desktop/phone layouts without horizontal overflow. See
[desktop](images/today-resume-desktop.png) and [phone](images/today-resume-phone.png).
Physical iPhone and screen-reader testing were not performed. The unchanged
engine and database suites were not rerun locally.


## 2026-10-21 — Three playable Sudoku previews

Added original Easy, Medium and Hard 9×9 previews, with one unique solution each.
An independent occupancy/MRV counter certifies uniqueness; a separate deduction
engine completes each board. Medium stalls under Easy techniques, and Hard stalls
under Medium techniques. The chosen seeds are 0, 10002 and 20180, found in 1, 3
and 181 attempts (about 0.02, 0.13 and 8.82 seconds locally). Hard requires a hidden
triple. The bounded construction probe remains manual; CI checks only the fixed
boards and a small deterministic recipe. See the
[offline certificates](measurements/sudoku-preview.json).

The lazy preview includes cell-first keypad/keyboard input, notes, Clear notes,
Undo/Redo, confirmed Reset, active timing and fingerprinted local saves. Logical
hints explain placements or candidate eliminations and highlight their support.
Wrong entries get a free general warning before an optional counted reveal and
undoable erase. No production game registration, daily saves, stats, leaderboard,
publisher or database changes. Runtime data contains no answers.

All 728 engine tests and 851 app tests pass, as do full typechecks, engine
lint/format and the production build. All 180 published puzzles replay and the
schema ID pattern matches the manifest. App lint retains the existing TracksStage
warning. The Pages-base entry is 437.90 kB (137.63 kB gzip); Sudoku is a separate
18.10 kB lazy chunk. Independent review caught an Escape focus issue, fixed with
a regression test; the final review found no remaining actionable findings.

Browser checks cover desktop and 393px layouts, Light/Dark/Auto, notes and saved
reload, history, staged mistakes, candidate hint application, target/Escape focus,
and complete keyboard play followed by cleared completion saves. See
[desktop](images/sudoku-preview-desktop.png) and
[phone](images/sudoku-preview-phone.png). Physical iPhone and screen-reader
testing remain unperformed; technique ratings need human playtesting before
three-per-day publication.

## 2026-10-21 — Sudoku playtest polish

Reproduced the reported Hard position and its 22-step hint. The default panel now
shows one deduction and the remaining candidates. Supporting deductions expands
six compact items: sixteen routine peer checks become one candidate summary,
while the earlier logical deductions remain in order. Native disclosure controls
support keyboard access; expanding the proof does not count another hint.

Number entry removes its digit from notes in the same row, column and box,
including numbers placed through hints. Undo/Redo restores both values and notes
as one move; erasing does not recreate removed notes. Selecting a filled digit
softly highlights matching cells and their rows/columns, with selection stronger.
Existing saves and their fingerprints are unchanged.

All 856 app tests, TypeScript checking and the production build pass. Lint retains
the existing TracksStage warning. Five new regression tests use the screenshot
position, verify peer-only cleanup/history/reload, and check matching highlights
and collapsed proof. Independent review found no actionable issues. Browser
checks cover the exact reported hint, keyboard disclosure/Escape focus, note
cleanup/Undo/Redo/reload, desktop dark and 393px light layouts without overflow.
See [compact hint](images/sudoku-compact-hint.png),
[matching digits](images/sudoku-matching-digits.png) and
[phone](images/sudoku-playing-aids-phone.png). Physical iPhone/screen-reader
checks and the unchanged Python engine/database suites were not run.

## 2026-10-21 — One focused-play timer policy

The README review exposed inconsistent timers: Queens, Star Battle and Train
Tracks counted elapsed page time, while the newer games excluded hidden time.
The chosen policy now counts only a visible, focused puzzle page across every
game and preview. Switching tabs or focusing another application pauses the same
clock used by the display, saves, final results, shares and leaderboard uploads.

`usePlayClock` replaces the stage-specific timer loops, reusing the existing
monotonic clock calculation. It settles focus/visibility/lifecycle transitions,
flushes current progress and stops permanently at completion. Existing save keys,
fingerprints, accumulated durations and first-solve records remain unchanged.
Earlier results cannot be retroactively converted into focused-play times.

Nine integration cases went red against the old behavior: seven game types cover
unfocused/hidden time, exact transition boundaries and saved remounts; Queens and
Train Tracks also verify final solve times and leaderboard handoff. All 865 app
tests, TypeScript checking and the production build pass. Lint retains the existing
TracksStage warning. Independent review found no actionable issues. Browser smoke
checks confirm Sudoku and Train Tracks render and hints still work; native focus
switching is unavailable in the automated browser, so actual app-switch/minimize
and physical iPhone verification remain manual. The unchanged engine/database
suites were not rerun.

## 2026-10-21 — Completed Sudoku digits

The number picker dims a digit at nine or more placements, including givens and
excluding notes. It stays usable for corrections and notes; the count does not
claim the placements are correct. Erase, Undo/Redo and saved reload derive the
cue from the board without changing the save format.

All 866 app tests, typechecking and the production build pass. Lint retains the
existing TracksStage warning. Browser checks cover history, desktop dark and
393px light layouts. See [completed digit](images/sudoku-completed-digit.png).
Physical iPhone, screen-reader and unchanged engine/database checks were not run.

## 2026-10-21 — Sudoku group notes

Dragging over Sudoku cells now highlights a selection immediately. Shift-click
and Shift-arrow extend it without dragging. With several cells selected, digits
add notes wherever missing, or remove a note when every empty selected cell has
it. Notes mode is unchanged; filled values are preserved, and Erase clears only
the selected empty cells' notes. Each group edit saves as one Undo/Redo move.
Selecting one cell restores normal entry. Selection itself is temporary.

Four regression cases cover mouse/touch pointer events, mixed notes, fixed and
player-filled cells, group history, single-cell entry, keyboard selection and
cancelled gestures. All 870 app tests, typecheck and Pages-base build pass; lint
retains the existing TracksStage warning. Browser checks cover actual horizontal
and vertical drags, group history, saved reload and desktop dark/393px light
layouts. See [group notes](images/sudoku-group-notes.png). Physical iPhone and
screen-reader checks and unchanged engine/database suites were not run.

Review caught keyboard focus losing its automatic scroll; pointer focus now
suppresses scrolling while keyboard navigation reveals the destination, verified
in a short browser viewport. The touch regression also covers implicit pointer
capture transferring from a cell to the grid without ending the drag.

## 2026-10-22 — Daily Sudoku

Sudoku now publishes three separate 9x9 levels each day, activated October 21.
The production schema and shared identity contract require a matching level in
the ID and board. Fifteen original boards cover October 21–25; the existing 180
archive files and preview definitions are unchanged. Their exact/logic
certificates and replay timings are in
[the launch measurement](measurements/daily-sudoku-launch.json). All fifteen
accepted seeds replay in about 1.7 seconds locally. A failed generation batch
advances to fresh candidates; replay never searches the rejected candidates.

The existing Sudoku stage now supports daily first-solve Stats, result/spoiler
sharing and optional leaderboard offering, while preserving preview progress,
notes, drag selection, hints and focused timers. Today groups three level links;
Archive, Stats and Leaderboards retain their exact level IDs. The stage remains
lazy loaded. See [Today](images/daily-sudoku-today.png),
[daily play](images/daily-sudoku-desktop.png) and
[phone layout](images/daily-sudoku-phone.png).

All 783 engine tests and 912 app tests pass, along with typechecks, engine
lint/format, app lint and the Pages-base build. App lint retains the existing
TracksStage warning. Independent review found no actionable issue. Browser QA
covers a complete daily solve, hint application/history, saved notes/reload,
Stats, archive and leaderboard level navigation, Today solved/resume states and
the original preview. Hosted submission was not exercised locally; the local
preview has no leaderboard configuration. Physical iPhone and screen-reader
checks remain manual.

The catalog's five relevant checks expand in migration 003, preserving scores,
grants, policies and RPCs. Real PostgreSQL 18.6 checks covered clean installation,
upgrades/retries and concurrent first submissions; CI uses PostgreSQL 17. The
maintainer confirmed successful application to Supabase before release.

Repeat publication through October 24 changed no files. Attempting to fill the
older games' October 25 slots encountered a long existing Queens seed search;
that run was stopped and only Sudoku's October 25 buffer was added. Other games'
generation policies and their nightly publisher remain unchanged.

## 2026-10-23 — Nurikabe engine foundation

The first Nurikabe slice adds an immutable square grid, a complete-board rule
checker, and bounded exact solution counting. Numbered islands have the required
size, distinct islands stay separate, and the nonempty sea remains connected
without a 2×2 pool. Diagonal island contact is allowed. The engine README records
the standard rules and an original uniquely solvable 5×5 example.

Search uses connected island shapes to enforce size and connectivity before it
combines candidates. One budget covers island enumeration and compatibility
checks. Exhaustion raises even after finding an answer; only an exhaustive
single-answer result proves uniqueness. The solver stops after two distinct
answers. Large islands can exhaust the budget, and the 10×10 input cap is not a
completion or difficulty guarantee.

The required engine suite passes 839 tests, with 90 weekly generator cases
excluded by the existing CI policy. All 43 new focused cases pass. Their
independent oracle covers all 624 nonempty 2×2 clue configurations and selected
3×3 boards. A separate exhaustive catalog confirms every satisfiable 2×2 and
3×3 clue layout, 247 in total. Independent review checked four 4×4 cases against
all 65,536 complete assignments each and found no correctness issues. Full
Pyright, Ruff lint, and format checks pass; the README example executes.

This PR changes no app, public puzzle files, daily registration, schema,
publisher, leaderboard, or database. It provides no playable preview or human
logical-difficulty rating. Preview construction and logical deductions remain
follow-ups. App and archive checks were not repeated locally because their
inputs and production paths are unchanged; existing GitHub checks still apply.

## 2026-10-23 — Playable Nurikabe preview

The preview now has one original 5×5 introduction and two original 7×7 boards.
Each has an exhaustive unique-solution certificate. The browser receives only
clues; answers and exact-search evidence stay in the offline report. Run
`uv run python -m tools.nurikabe_preview` from `engine/` to recheck the actual
catalog and certificate. No generator or difficulty rating is claimed.

Players shade sea; unshaded cells form the islands, and explicit land dots are
optional. Local warnings cover confirmed merged or oversized islands and 2×2
sea squares. Unfinished connectivity is not a mistake. Completion checks every
rule against the player's marks without a hidden answer or browser solver.

The new lazy route has a Today link, dedicated rules, separate fingerprinted
preview saves, focused-play timing, and the existing history and confirmed Reset
controls. One drag takes one Undo; cancelled gestures restore the preceding
board. Desktop controls sit beside the board; the phone layout uses a compact
picker above it. Daily registration, stats, leaderboards, publishing, and the
database are unchanged. Hints remain a follow-up.

All 942 app tests and 861 required engine tests pass. The existing 90 weekly
generator cases remain outside the required run. Full typechecks, the Pages-base
production build, engine lint and formatting pass. App lint retains the existing
TracksStage warning. Independent review found no actionable issues and matched
the TypeScript checker against Python across 50,544 ternary 2×2 states.

Live desktop verification covered vertical painting, one-step Undo/Redo, and
saved reload. A 393px phone layout has no horizontal overflow. See
[phone layout](images/nurikabe-preview-phone.png). Reset displayed its native
confirmation, which blocked browser automation, including dismissal attempts.
Accept/cancel and completed-play behavior pass automated component tests, but
live completion, Light-mode interaction, and native confirmation dismissal were
not verified. Physical iPhone and VoiceOver checks remain manual.

## 2026-10-25 — More Sudoku techniques in Learn

Hidden pairs and naked triples join the existing guided exercises before X-wing.
The hidden pair starts with two digits confined to two cells despite extra notes.
The triple uses three different two-digit note sets in one column. Both ask which
candidates remain, with the existing feedback, explanation and retry controls.
Original lesson IDs, prepared positions and completion records are preserved.

Pattern highlights now follow an explicit policy. Naked subsets show every
pattern cell. Hidden pairs show cells containing the reserved digits, including
the solid target. Locked candidates and X-wing retain their existing highlights.
The app's daily puzzle, hint and leaderboard paths are unchanged.

`uv run python -m tools.sudoku_lessons` recomputes all five offline certificates
from committed givens and compares them with the report. It checks exact
uniqueness, deduction replay, prepared notes and the new subset geometries.
`--write-report` writes only after the complete catalog passes. Searches for the
two original boards were bounded development work and are absent from tests.
Solutions stay outside runtime imports.

All 949 app tests pass. The targeted Python Sudoku and lesson tests pass 19 cases.
Full app and engine typechecks, lint, engine formatting and the Pages-base build
pass, with the existing TracksStage lint warning unchanged. Independent review
found no actionable code issues and confirmed the original three certificates.
The full engine suite and archive replay are left to the existing GitHub checks.

Live browser checks covered both answers, incorrect feedback, explanation/retry,
keyboard input, navigation and persisted lesson completion. Desktop Auto/Dark and
Light layouts and a 393px phone layout were checked. The phone board fits without
horizontal scrolling. See the [desktop lesson](images/learn-subsets-desktop.png)
and [phone lesson](images/learn-subsets-phone.png). Physical iPhone and VoiceOver
checks remain manual.

## 2026-10-25. Sudoku practice sets

Each of the five Learn techniques now has three exercises, for 15 in total.
The original guided examples keep their IDs, givens, prepared notes and complete
certificate entries. Ten additional original positions give players repeated
practice with different cells and digits. All 15 source boards and prepared
positions are distinct.

Technique cards show three full-width exercise links and completion out of three.
The first example remains guided. Later exercises keep the target visible and
offer an optional clue for the pattern. Correct answers and explanations reveal
the complete pattern. Revealing does not complete an exercise. Retry and exercise
navigation reset clue visibility. Completion uses the existing browser key, and
Next exercise stays within the current technique.

Exercise descriptors and givens share one JSON catalog used by the app and the
independent Python verifier. The verifier requires three exercises per technique,
stable IDs, distinct sources, exact uniqueness and matching deduction traces.
Finite searches for new examples are development-only work. Daily puzzle rules,
hints, stats and leaderboard behavior are unchanged.

All 960 app tests and 20 targeted Python Sudoku/lesson tests pass. Full typechecks,
lint, Python formatting, the Pages-base build and the 15-exercise certificate
command pass. The existing TracksStage lint warning remains. Independent review
confirmed all five originals and found no actionable issues. The full engine
suite and archive replay remain covered by the GitHub checks.

Browser checks cover initially hidden practice clues, clue persistence after an
incorrect answer, exact answers, explanation without completion, retry, sibling
navigation and saved progress after reload. The phone layout has no horizontal
overflow at 393px. Desktop Auto/Dark and phone Light layouts were inspected.
See the [technique cards](images/learn-practice-desktop.png) and
[phone practice](images/learn-practice-phone.png). Physical iPhone and VoiceOver
checks remain manual.
