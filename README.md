# Daily Puzzles

A daily logic-puzzle web app. Inspired by LinkedIn Queens, built from scratch: a Python
engine that generates and proves puzzles, and a static TypeScript/React app that plays
them.

There is no server, no database and no account. The entire product is a static site plus
a directory of committed puzzle files.

---

## The puzzle: Queens

On an `N`x`N` grid divided into exactly `N` coloured regions, place `N` queens so that:

1. **Row** — exactly one queen per row.
2. **Column** — exactly one queen per column.
3. **Region** — exactly one queen per region.
4. **Touching** — no two queens in neighbouring cells, including diagonally.

The subtlety that trips up most clones: rules 1 and 2 already forbid horizontal and
vertical neighbours, so rule 4 only ever adds the **four diagonal** neighbours. This is
*not* classic N-queens — two queens may share a long diagonal as long as they are not
adjacent.

The engine additionally guarantees the puzzle is fair, which the player is never told:

5. Regions partition the grid, and each is 4-connected.
6. Exactly one solution exists.
7. It is solvable by pure logic rather than guessing.

Rule 6 is a hard gate enforced by an exact solver. Rule 7 is a soft signal: we measure how
deeply a deduction engine has to reason, and rate the board. We do not pretend "solvable
without guessing" is formally decidable — it is not.

> Connectivity is the whole of rule 5, and the choice is deliberate. An earlier draft also
> required that a region never touch *itself* diagonally, reasoning that this made the blob
> boundaries unambiguous. It does not: a 4-connected set with no diagonal self-contact is
> necessarily a straight line, because any path that turns at `p -> q -> r` leaves `p` and
> `r` diagonally adjacent. Enumerating every legal region of a 3x3 under that rule yields 27
> shapes, none of them two-dimensional. The check would have quietly reduced every puzzle to
> parallel stripes while passing every test written against stripes.

---

## Architecture

```
daily-puzzles/
  engine/     Python: PRNG, generator, solution counter, deduction engine, difficulty
  app/        TypeScript: React UI, game state, client-side hint engine
  schema/     puzzle.schema.json  ← single source of truth for the file format
  conformance/  fixtures both languages must agree on
```

**The two halves speak through exactly one file.** `engine/` writes
`app/public/puzzles/<date>.json`; `app/` reads it. Neither imports the other.

That boundary is why the format is owned by neither language. `schema/puzzle.schema.json`
is validated by `jsonschema` in Python and `ajv` in TypeScript, so the two parsers cannot
drift. The `conformance/` suites extend the same idea from parsing to *reasoning*: a
board can be structurally valid and logically broken, so board-level fixtures are a
separate suite from schema-level ones.

The engine is pure TypeScript-free Python that runs in a terminal. The UI cannot use
Python (no WASM in the bundle), so the app keeps its own `Board` model — but that is
genuinely shared domain, not accidental duplication, and it is what lets the hint engine
work on the player's live board without ever shipping a stored solution.

---

## Setup

Requires Python 3.13+ (`uv`) and Node 22+.

```sh
brew install uv node

cd engine && uv sync && cd ..
cd app    && npm install && cd ..
```

## Commands

Engine:

```sh
cd engine
uv run pytest        # unit + property-based tests
uv run ruff check .  # lint
uv run ruff format . # format
uv run pyright       # strict type check
```

App:

```sh
cd app
npm test         # unit + shared conformance suite
npm run typecheck
npm run lint
npm run dev      # dev server
npm run build    # production build
```

Both suites must be green in the same commit. A fixture change and the code change that
motivated it belong together.

---

## Puzzle file format

The contract lives in [`schema/puzzle.schema.json`](schema/puzzle.schema.json).

```json
{
  "id": "2026-09-30",
  "type": "queens",
  "size": 5,
  "seed": 1234567890,
  "generatorVersion": 1,
  "regions": [0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3]
}
```

- `regions` is row-major, one region id per cell, length exactly `size * size`.
- `seed` drives a deterministic PRNG, so any puzzle replays byte-for-byte.
- `regionCapacity` is omitted for Queens (every region holds one queen) and required for
  Star Battle. Keeping it in the format is what lets both puzzle types share one solver.

The schema handles structure. The size-dependent invariants it cannot express — array
length tied to `size`, contiguous region ids, connectivity — are enforced in code on both
sides.

Solutions are **never shipped to the client**. Hints are computed live from the player's
current board, which is both leak-proof and more useful, because a hint can explain *why*
a cell is forced rather than just revealing it.

---

## Milestones

| # | Milestone | Status |
| --- | --- | --- |
| 1 | Scaffold both toolchains, shared schema, conformance fixtures | done |
| 2 | Solution counter — exact, parameterised by region capacity | done |
| 3 | Seeded generator, uniqueness gate, replay, ASCII renderer | done |
| 4 | Deduction engine and difficulty score (timeboxed, cuttable) | |
| 5 | React shell, `puzzleOfToday(date, tz)`, archive routes | |
| 6 | Board UI, keyboard and screen reader support, hint engine | |
| 7 | Game loop: undo, timer, win detection, auto-mark | |
| 8 | Daily pipeline: cron generates, commits, CI re-verifies every puzzle | |
| 9 | Stretch: share text, local stats, dark mode | |
| 10 | Stretch: Star Battle as a second puzzle type | |

Milestones 2 to 4 are the critical path, and they are all Python. If the app half slips,
the engine alone — a CLI with an exact uniqueness prover and property tests — is still
worth publishing.

### The solution counter

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

### The generator

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

The stream is a pinned SplitMix64 PRNG ([`prng.py`](engine/src/queens_engine/prng.py)) —
**not** Python's `random`, whose streams are not guaranteed stable across versions. The
first outputs are pinned by golden vectors in `tests/test_prng.py`; changing the stream is a
breaking change, not a refactor. `verify_replay(puzzle)` regenerates a puzzle from its seed
and confirms the board is identical — the CI check the daily pipeline will run on every
committed file.

`tools/generate.py` is the day-to-day entry point: it derives a stable seed from a date and
writes both the puzzle JSON and an ASCII render:

```sh
python -m tools.generate --date 2026-10-01 --out app/public/puzzles
```

---

## Conventions

- Commits are concise and imperative, e.g. `Add solution counter`.
- Every puzzle file is committed. Puzzle history is visible in `git log`.
- No databases, auth, ORMs or task-runner monorepo. If a change needs one of those,
  the scope has crept and the plan needs revisiting.
