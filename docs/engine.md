# The engine

Puzzle generation, exact proof and difficulty rating, in [`engine/src/queens_engine/`](../engine/src/queens_engine). Pure Python, no dependencies beyond `jsonschema`, runs in a terminal.

## The solution counter

`engine/src/queens_engine/solver.py` counts solutions exactly: no heuristics, no sampling,
no time cutoff. A state is the row, how many stars each column holds, how many stars each
region holds, and which columns the previous row used — that last one only because the
no-touching rule needs it.

Three decisions worth knowing before building on it:

- **Region counts are packed into one integer in mixed radix**, as are column counts, so a
  state is four small ints and the memo stays cheap. With one star per row the radix is 2
  and the packed values *are* the bitmasks, so Queens costs nothing for the generality.
  Completing every row means the total is exactly `sum(capacity)` with no region or column
  ever over-filled, so both are exactly full — there is no final check to forget.
- **Columns are counted, not marked.** A column holds `stars_per_row` stars, so on a
  multi-star board it must be reusable. Tracking that as a boolean was correct for Queens
  and silently reported *every* Star Battle board as unsolvable. Columns now pack the same
  way regions do.
- **`count_solutions(board, limit=2)` returns `min(actual, 2)`** and stops early. The
  generator only needs to know zero, one, or more-than-one, and bailing out keeps hopeless
  boards cheap. Because a cached value is a *truncated* count, the memo is built per call
  and never shared between different limits.

Capacity comes from `Board.region_capacity` rather than a separate argument, so the capacity
the solver honours is the same one `Board` validated. Queens and Star Battle run the same
code; only the number of stars per row differs.

## The generator

`engine/src/queens_engine/generator.py` is deterministic end to end. Given a seed it:

1. Places a random queens solution by backtracking over rows with a random column order.
   The main-diagonal and anti-diagonal invariants are kept in **separate sets** — a value
   from one can equal a value from the other for cells that do not attack, so a shared set
   would reject valid placements (a subtle bug the prototype actually had).
2. Grows regions outward from their queens, one cell at a time, from a random frontier.
   Each region keeps its queen, stays 4-connected by construction, and the grid is fully
   claimed because the frontier is connected.
3. Runs the exact counter as a **uniqueness gate**: boards with more than one solution are
   discarded and the stream moves on (rejection sampling).

Every stage is a pure function of the seed, so the same seed always produces the same
board — replay is byte-for-byte. Sizes 5–9 are supported; the default is 8. The attempt
budget grows with size (a 9x9 board is a genuinely rare arrangement), and if it is
exhausted a `GenerationError` is raised rather than shipping a puzzle with a second
solution.

The stream is a pinned SplitMix64 PRNG ([`prng.py`](../engine/src/queens_engine/prng.py)) —
**not** Python's `random`, whose streams are not guaranteed stable across versions. The
first outputs are pinned by golden vectors in `tests/test_prng.py`; changing the stream is a
breaking change, not a refactor. `verify_replay(puzzle)` regenerates a puzzle from its seed
and confirms the board is identical — the check `tools/verify.py` and CI run on every
committed file.

`tools/generate.py` is the day-to-day entry point: it derives a stable seed from a date and
writes both the puzzle JSON and an ASCII render. It prints the difficulty as a bonus, and
`--logic-only` keeps bumping the seed until the board needs no guessing:

```sh
python -m tools.generate --date 2026-10-01 --out app/public/puzzles
python -m tools.generate --date 2026-10-01 --logic-only
```

## The deduction engine

`solver.py` counts solutions; `deduce.py` asks how a person would *reach* one. It replays
the rules against the candidate cells until nothing fires, recording each step:

- **Singles** (region, row, column): a group with one candidate left must place its queen.
- **Intersections**: if a region's candidates all sit in one line, the two share a queen
  and the line's other cells are dead (and the mirrored region/line claim).
- **Subsets**: pigeonhole across regions, rows and columns in all six directions. If k
  regions can only place in k rows, those rows are exactly consumed; the k rows k columns
  case is the X-wing players know. A set that cannot fit in its cells is a contradiction.

Rules are small-integer weighted (1 / 2 / 4) and the difficulty score is the weighted sum
of firings, plus a 5-point trial each time the search has to hypothesise. A board that
stalls on pure logic is **not labelled unsolvable**: it needs a style of reasoning this
engine does not have, exactly as the soft-signal contract above intends. `deduce` can then
continue with a bounded hypothesis search (a trial that reaches a contradiction is a
genuine deduction, courtesy of the unique solution), which is what lets it always find the
unique solution for the boards the generator ships.

`score_difficulty(board)` maps that trace to a score and a band (Easy..Nightmare). The score
is a *soft* signal — it rates how hard this engine found the board, not a Platonic
difficulty — and its bands are calibrated against what the generator actually produces.

Measured over logic-only boards (400 at 7x7, 130 at 8x8, 30 at 9x9):

| Size | Easy | Medium | Hard | Expert | Nightmare |
| ---- | ---- | ------ | ---- | ------ | --------- |
| 7x7  | 41   | 119    | 31   | 0      | 0         |
| 8x8  | 6    | 29     | 21   | 1      | 0         |
| 9x9  | 0    | 1      | 5    | 2      | 0         |

**Nightmare is unreachable without guessing.** Not one logic-only board in 560 scored
Nightmare, and every Nightmare board found needed at least one hypothesis. So the top of
the scale is a real ceiling, not a target: reaching past it means giving the deduction
engine stronger rules so harder boards *become* logic-only, not relaxing the guarantee.

The band is now recorded in the puzzle file as an optional `difficulty` (1-based into
`LEVEL_NAMES`), which the app shows on the chooser card and the archive. Files published
before the ramp have no field and display nothing — defaulting them to Easy would put a
label on a puzzle the engine never rated.

## The weekly ramp

Difficulty used to be a number the pipeline logged and threw away: every day shipped the
first unique logic-only board its seed produced, which is 8x8 every day and lands on
Hard, Easy or Nightmare by luck. The ramp turns that into a promise, using both levers
available:

| Day   | Size | Band   | Measured cost |
| ----- | ---- | ------ | ------------- |
| Monday | 7x7 | Medium | 0.4s |
| Tuesday | 8x8 | Medium | 1.1s |
| Wednesday | 8x8 | Hard | 17s |
| Thursday | 8x8 | Hard | 17s |
| Friday | 9x9 | Hard | 31–46s |
| Saturday | 9x9 | Expert | 78–163s |
| Sunday | 9x9 | Expert | 78–163s |

Size sets the floor (a 9x9 board is never Easy whatever seed it lands on), band is what the
seed search then aims for. Neither regresses: size steps 7, 8, 8, 8, 9, 9, 9 and band
steps Medium to Expert, so the weekend is both the largest and the deepest. Friday
introduces the big board a day early, so the week ends on size *and* depth at once.

`generate_ramped` aims at the target and keeps the **hardest board the budget turned up**
rather than walking a fallback ladder, so a rare target still ships something hard instead
of nothing. It will never accept a board *harder* than the target: an Expert Tuesday would
break the ramp as surely as a Nightmare Monday.

Expert is reached far more cheaply at 9x9 than at 8x8 — 1 board in 12 against 1 in 130,
because 9x9 boards are more constrained to begin with. That measurement is why the ramp
peaks at 9x9. Forcing Expert at 8x8 instead was tried and abandoned: 400 attempts failed to
find one for a real date, and a flaky band is worse than a slightly smaller board.

The budget counts *attempts*, not boards produced. A seed that cannot generate at all has
to count against it, or a size the generator cannot satisfy would loop forever.

## Which Star Battle sizes exist, and why version 2

**Not every size admits a star count**: two non-touching stars per row need a row span
of three columns, and each row shadows its neighbour, so within the generator's 5–9 range
only 8x8 and 9x9 admit two stars per row. Three stars need at least 12x12, beyond the
range.

A brute-force search over row combinations confirmed the table, and
`generate_puzzle` fails fast on impossible combinations rather than burning
20,000 attempts discovering that.

`generatorVersion` is part of the contract too: Queens is version 1 (frozen — the
committed files replay through the exact PRNG stream that made them) and Star Battle is
version 2, a separate placement function that cannot perturb the version-1 draws. A new
star layout bug would be caught by `verify_replay` in CI before it reached a player.
