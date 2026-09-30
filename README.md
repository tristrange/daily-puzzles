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
separate suite from schema-level ones, and hint fixtures a further step still — they pin
what each side *deduces* from a player's live board, not just what it parses.

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
uv run python -m tools.publish --out ../app/public/puzzles  # publish daily puzzles
uv run python -m tools.verify --dir ../app/public/puzzles   # replay-verify them
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
| 4 | Deduction engine and difficulty score (timeboxed, cuttable) | done |
| 5 | React shell, `puzzleOfToday(date, tz)`, archive routes | done |
| 6 | Board UI, keyboard and screen reader support, hint engine | done |
| 7 | Game loop: undo, timer, win detection, auto-mark | done |
| 8 | Daily pipeline: cron generates, commits, CI re-verifies every puzzle | done |
| 9 | Stretch: share text, local stats, dark mode | |
| 10 | Stretch: Star Battle as a second puzzle type | |

Milestones 2 to 4 were the critical path, and they are all Python. The engine alone — a
CLI with an exact uniqueness prover and property tests — would be worth publishing even if
the app half slipped. The milestones that shipped it are historical now.

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
and confirms the board is identical — the check `tools/verify.py` and CI run on every
committed file.

`tools/generate.py` is the day-to-day entry point: it derives a stable seed from a date and
writes both the puzzle JSON and an ASCII render. It prints the difficulty as a bonus, and
`--logic-only` keeps bumping the seed until the board needs no guessing:

```sh
python -m tools.generate --date 2026-10-01 --out app/public/puzzles
python -m tools.generate --date 2026-10-01 --logic-only
```

### The deduction engine

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

`score_difficulty(board)` maps that trace to a score and a band (Easy..Nightmare), with
bands calibrated against what the generator actually produces: default 8x8s spread across
all five levels, 5x5s mostly Easy/Medium. The score is a *soft* signal — it rates how hard
this engine found the board, not a Platonic difficulty — and it is deliberately **not** in
the puzzle file. Difficulty is the daily pipeline's steer on *which* seed to ship, not a
property the client needs.

### The app shell

The app is a static React SPA with no server, so it routes with `HashRouter` — a URL like
`#/archive/2026-09-30` works on any static host without rewrite rules. Three shapes of
route:

- `/` — today's puzzle, where "today" is the *player's* calendar day.
- `/archive` — the list of published puzzles, discovered by probing the recent-window
  files (`public/puzzles/<date>.json`) rather than an index manifest that could rot.
- `/archive/:id` — a specific puzzle by id.

`puzzleOfToday(date, tz)` is the seam between the engine's date-keyed files and the
player's clock:

```ts
puzzleOfToday(new Date('2026-09-30T22:30:00Z'), 'Asia/Tokyo') // '2026-10-01'
puzzleOfToday(new Date('2026-09-30T22:30:00Z'), 'America/Los_Angeles') // '2026-09-30'
```

It is a pure function of an instant and an IANA zone, resolved through `Intl` rather than a
hand-rolled UTC offset, so a player near a date line never guesses which day they are owed.
Puzzle ids are validated as real calendar days (`2026-02-30` is rejected) before they are
even fetched, and every file the app reads is passed through the same JSON schema +
`Board` validation as the engine uses.

A week of sample puzzles (`2026-09-27`..`2026-10-03`) is committed so the archive had
content before the pipeline existed; `tools/publish.py` now keeps it filled from a cron.

### The board and the hint engine

M6 turns the static region poster from M5 into the playable board. `game.ts` holds the
player's state — which cells hold a queen and which are marked out — as pure transitions
(`toggleQueen`, `toggleMark`, `clearCell`), and computes `conflicts` between placed
queens. Rule precedence there is row > column > region > touch, so a pair is reported
under the most specific rule: two queens that share a region *and* a row are called a row
conflict first.

`hints.ts` is a port of the **pure-logic half** of `deduce.py` (the singles, intersections
and subsets passes, in that exactly order) with two differences:

- it stops at the **first** firing instead of running to a fixpoint, and
- it starts from the player's live queens and marks, so nothing about the puzzle's
  solution is ever sent to the browser.

The answer is pinned by the `hint-cases/` conformance suite, which both languages assert:
Python replays its own rules from the same player states and must agree with the app's
hint. Because the fixture cases cover every rule — including a mid-game state where the
**subset** pigeonhole is genuinely the next forced move, which no empty board can ever
produce — the app's hint cannot contradict the engine that rated the puzzle. A hint is
either `place a queen here` or `mark this cell dead`; when nothing is forced the app says
so rather than guessing, and a contradictory queen set is caught by `conflicts()` *before*
the rules run, because a poisoned candidate state would produce nonsense.

The board itself is a semantic ARIA grid: `role=grid` over `role=row`/`role=gridcell`,
with a roving tabindex (exactly one cell in the tab order) and full keyboard play —
arrows to move, Enter/Space to place or take back a queen, `X` to mark, Delete/Backspace
to clear, `H` for a hint. Screen readers get a per-cell label (`Row 3, column 4, marked`)
and a visually hidden `aria-live` region carries hint and conflict announcements, so a
keyboard-only player drives the board end to end. A hint highlights the one cell it
advises, and conflicting queens glow red until resolved.

### The game loop

M7 adds what makes the board a game. `placeQueenAutoMark` mounts X marks on everything
the placed queen rules out (using the *same* elimination set the hint engine simulates,
so the visible board and the engine never disagree); `Auto-mark on` makes that the
default placement. Win detection is reactive: the state is solved the moment it holds
`size` queens with no conflicts, which freezes the timer, locks the board and announces
the time.

Every placement, mark and clear is a pure state transition pushed onto a 100-entry undo
stack — a button and Ctrl/Command+Z pop it. Because the history stores whole states
rather than inverse actions, undo is exact even for an auto-mark sprawl. The timer is
zero-cost to the engine: it counts up from when the puzzle appears and freezes at the
solve instant; there is no server to check with, so the only clock that matters is the
player's.

### The daily pipeline

M8 closes the loop the samples were propping open: the archive publishes itself. Two
tools and two workflows do it.

```sh
cd engine
uv run python -m tools.publish --out ../app/public/puzzles   # fill the gap to lead days ahead
uv run python -m tools.verify --dir ../app/public/puzzles    # replay every committed puzzle
```

`tools/publish.py` scans the archive for missing dates and fills them from the first
missing day through today plus a `--lead` (default 3), using exactly the same recipe as
`tools/generate --logic-only` — a seed hashed from the date, size 8, bumped upward until
`deduce` reaches a solution without guessing. It is idempotent by construction: an
existing file is never rewritten, and a date always maps to one puzzle, so running it
twice in a day is a no-op and a missed week self-heals on the next run. `tools/verify.py`
re-parses every committed puzzle and calls `verify_replay` on it, so a generator change
that would have drifted the archive fails loudly before anything is merged.

The workflows live in [`.github/workflows/`](.github/workflows):

- `ci.yml` runs on every pull request and push to `main`: the shared-engine gates
  (pytest, pyright, ruff) plus `tools.verify` over the committed puzzles, and the app
  gates (vitest, typecheck, oxlint, build).
- `publish.yml` runs from a daily cron (and by hand via `workflow_dispatch`): generators
  and verifies the missing dates, then commits and pushes only when the diff is non-empty,
  so the archive and `git log` tell the whole publishing story.

---

## Conventions

- Commits are concise and imperative, e.g. `Add solution counter`.
- Every puzzle file is committed. Puzzle history is visible in `git log`.
- No databases, auth, ORMs or task-runner monorepo. If a change needs one of those,
  the scope has crept and the plan needs revisiting.
