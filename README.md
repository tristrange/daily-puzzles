# Daily Puzzles

A daily logic puzzle, published as a static site. Inspired by LinkedIn Queens, built from
scratch: a Python engine that generates and proves puzzles, and a static TypeScript/React
app that plays them.

**Live site → [tristrange.github.io/daily-puzzles](https://tristrange.github.io/daily-puzzles/)**

No server, no database and no account. The entire product is a static site and a directory
of committed puzzle files. Two games ship, each with its own solve of the day: **Queens**
and **Star Battle**.

---

## The puzzles

**Queens** — on an `N`×`N` grid divided into `N` coloured regions, place `N` pieces so
that every row, every column and every region holds exactly one, and no two pieces touch,
**including diagonally**.

The diagonal is the part that trips up most clones. One-per-row and one-per-column already
forbid horizontal and vertical neighbours, so the touching rule only ever adds the four
diagonal neighbours — which means this is *not* classic N-queens. Two pieces may share a
long diagonal as long as they are not adjacent.

**Star Battle** — the same board with two stars per row, column and region. Same
no-touching rule, same solver.

Neither game will hand you a puzzle you cannot win fairly. The generator guarantees three
things the player is never told: regions partition the grid and each is 4-connected,
**exactly one solution exists**, and it is **solvable by pure logic rather than guessing**.

Uniqueness is a hard gate, enforced by an exact solver with no heuristics and no time
cutoff. "Solvable without guessing" is a soft signal — we measure how deeply a deduction
engine has to reason and rate the board from that. It is not formally decidable, and the
project does not pretend otherwise.

---

## Why it is built this way

Two decisions shape everything else.

### One file, two languages

The engine writes `app/public/puzzles/<date>.json`; the app reads it. **Neither imports
the other.** That boundary is why the file format is owned by neither language:
[`schema/puzzle.schema.json`](schema/puzzle.schema.json) is validated by `jsonschema` in
Python and `ajv` in TypeScript, so the two parsers cannot drift apart.

Parsing agreement is necessary but not sufficient — a board can be structurally valid and
logically broken. So [`conformance/`](conformance/) extends the same idea from parsing to
*reasoning*, in three layers:

| Suite | Pins |
| --- | --- |
| `schema-cases/` | what a file may say, and which rule rejects a bad one |
| `board-cases/` | which board is legal, and **which rule** rejects an illegal one |
| `hint-cases/` | what each side *deduces* from a player's live board |

Every expectation is asserted from both languages. A board can parse and still be nonsense
— and it has been.

### The puzzle is a pure function of its seed

Given a seed, the engine produces the same board forever, so any puzzle can be replayed and
checked. The nightly publisher regenerates and verifies every committed file, which means
a change that would quietly drift the archive fails CI before a player ever sees it.

---

## Architecture

```
daily-puzzles/
  engine/       Python: generator, exact solver, deduction engine, difficulty
  app/          TypeScript: React UI, game state, client-side hint engine
  schema/       puzzle.schema.json — the single source of truth for the format
  conformance/  fixtures both languages must agree on
  docs/         design notes, measurements and the build log
```

The app keeps its own `Board` model rather than sharing the engine's. That is genuine
shared domain, not accidental duplication: the browser cannot run the Python engine, and
the app's hint engine has to run against the player's *live* board rather than a stored
solution. The suites above are what keep the two copies honest.

The board is a semantic ARIA grid — `role=grid` over `role=row`/`role=gridcell`, a roving
tabindex, full keyboard play and a screen-reader label per cell — so a keyboard-only player
drives the game end to end.

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
uv run python -m tools.generate --date 2026-10-01   # one puzzle, plus an ASCII render
uv run python -m tools.publish  --out ../app/public/puzzles   # fill the archive
uv run python -m tools.verify   --dir ../app/public/puzzles   # replay every committed file
```

App:

```sh
cd app
npm test         # unit + the shared conformance suites
npm run typecheck
npm run lint
npm run dev      # dev server
npm run build    # production build
```

Both suites must be green in the same commit. A fixture change and the code change that
motivated it belong together.

---

## The file format

```json
{
  "id": "2026-10-11",
  "type": "queens",
  "seed": 1912550966,
  "generatorVersion": 1,
  "difficulty": 4,
  "board": {"size": 9, "regions": [0, 0, 0, 0, 0, 0, 1, 1]}
}
```

- `board` holds everything describing the grid, so the shape belongs to the game rather
  than the envelope.
- `regions` is row-major, one region id per cell, length exactly `size * size`.
- `seed` drives a pinned SplitMix64 stream — **not** Python's `random`, whose output is not
  stable across versions — so any puzzle replays exactly.
- `regionCapacity` is omitted for Queens and required for Star Battle. Keeping it in the
  format is what lets one solver serve both.

- Solutions are **never shipped to the client**. Hints are computed live from the player's
  current board, which is leak-proof and more useful, because a hint can explain *why* a cell
  is forced rather than just revealing it.

The schema handles structure. The invariants it cannot express — array length tied to
`size`, contiguous region ids, region connectivity — are enforced in code on both sides,
which is what the board-level conformance suite is for.

---

## Deep dives

The details worth reading, kept out of the front page:

- **[docs/engine.md](docs/engine.md)** — the exact solution counter, the seeded generator,
  the deduction engine and its difficulty bands, the weekly ramp, and the measurements
  behind them.
- **[docs/app.md](docs/app.md)** — routing, the accessible board, the ported hint engine,
  input, colour science, stats and share text.
- **[docs/pipeline.md](docs/pipeline.md)** — publishing, replay verification, and the
  deployment arrangement.
- **[docs/puzzle-model.md](docs/puzzle-model.md)** — the domain model, and the reasoning
  behind the file format.
- **[docs/journal.md](docs/journal.md)** — the build log: milestones, rejected
  alternatives, and the bugs that were found rather than avoided.

---

## Conventions

- Commits are concise and imperative, e.g. `Add solution counter`.
- Every puzzle file is committed. Puzzle history is visible in `git log`.
- No databases, auth, ORMs or task-runner monorepo. If a change needs one of those, the
  scope has crept and the plan needs revisiting.
