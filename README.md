# Daily Puzzles

A daily logic puzzle, published as a static site. Inspired by LinkedIn Queens, built from
scratch: a Python engine that generates and proves puzzles, and a static TypeScript/React
app that plays them.

**Live site → [tristrange.github.io/daily-puzzles](https://tristrange.github.io/daily-puzzles/)**

No server, no database and no account. The entire product is a static site and a directory
of committed puzzle files. **Queens**, **Star Battle**, **Train Tracks**, and
**Word Paths** each keep their own first solve. Word Paths daily slots start on
October 15, 2026; its preview remains available independently.

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

Neither game will hand you a puzzle you cannot solve, and both guarantee two things the
player is never told: regions partition the grid and each is 4-connected, and **exactly one
solution exists**.

That uniqueness is a hard gate, enforced by an exact solver with no heuristics and no time
cutoff. It is the same guarantee for both games.

**Queens carries a third guarantee: it is solvable by pure logic rather than guessing.**
Star Battle does not, and claiming it would be false — of 1000 sampled two-star boards only
0.1% finished on rules alone, so the publisher gates Star Battle on uniqueness and says
exactly that rather than claiming a property it does not check. ("Solvable without
guessing" is a soft signal in any case: we measure how deeply a deduction engine has to
reason and rate the board from that. It is not formally decidable, and the project does not
pretend otherwise.)

[Why Star Battle is not logic-gated →](docs/journal.md#the-second-puzzle-type)

**Train Tracks** — connect two given edge endpoints with one continuous track, matching
all row and column counts. No branches or closed loops. Starting October 14, 2026,
each day offers **Small 8×8**, **Medium 10×10**, and **Large 12×12**. These describe
board size, not difficulty. New boards use every row and column, scatter extra
givens, and have a proven unique solution; no logic-only guarantee is claimed.
Historical 7×7 boards remain playable with their original rules and contents.

Unfinished Train Tracks boards and elapsed time save independently in this browser.
Time pauses between page visits; undo belongs to the current visit. Finished boards
start fresh for replay while the original solve stays in stats. Appearance defaults
to Auto, following the system, with Light and Dark overrides.

**Word Paths** — find four English words of lengths 3, 4, 5 and 6 on a 5×5
letter grid. Trace orthogonally, use every letter once and never overlap words.
A legal word can lead to a dead end; Undo lets you try another path. Each board
has one complete cover against its versioned vocabulary. New boards accept
16,781 words from SCOWL while answers use a familiar 748-word pool; original
boards retain their frozen vocabulary. Uniqueness is not claimed across every
English word. No difficulty rating or hints are claimed.
Daily progress and results are separate from the [ten-board preview](https://tristrange.github.io/daily-puzzles/#/preview/word-paths).

---

## Add to your Home Screen

On iPhone, open the site in Safari and choose **Share → Add to Home Screen**.
Keep **Open as Web App** enabled if shown, then tap **Add**. The icon launches
Daily Puzzles in its own window, with Auto appearance following your system.

After the first online visit, wait for **App ready offline**. Today saves its
available boards; opening the archive saves the puzzles it loads. Those boards
can then be played without a connection. New or unopened puzzles need internet.

Safari and the installed iPhone app keep separate progress, stats, settings and
downloads. Open the installed app online before relying on it offline.
Train Tracks and Word Paths resume unfinished games; Queens and Star Battle
restart unfinished attempts on reload. Browser cache eviction or clearing site
data can remove downloads. Updates wait until all app windows close; finish
your game, then close and reopen them. No account or syncing is added.

## Why it is built this way

### One file, two languages

The engine writes `app/public/puzzles/<date>.json`; the app reads it. **Neither runs
the other at runtime.** Schema fixtures and the frozen English vocabulary are
shared reference data. That boundary is why the file format is owned by neither language:
[`schema/puzzle.schema.json`](schema/puzzle.schema.json) is validated by `jsonschema` in
Python and `ajv` in TypeScript, so the two parsers cannot drift apart.

Parsing agreement is necessary but not sufficient — a board can be structurally valid and
logically broken. So [`conformance/`](conformance/) extends the same idea from parsing to
*reasoning*, and to the small tables both sides would otherwise copy:

| Suite | Pins |
| --- | --- |
| `schema-cases/` | what a file may say, and which rule rejects a bad one |
| `board-cases/` | which board is legal, and **which rule** rejects an illegal one |
| `hint-cases/` | what each side *deduces* from a player's live board |
| `hint-baseline` | the same, over 1,299 generated positions rather than a dozen curated ones |
| `id-cases/` | puzzle id naming — a spelling the two disagree on is a puzzle that is published, correct, and unfindable |
| `band-cases/` | difficulty band names, which the engine prints and the player reads |

Every expectation is asserted from both languages.

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
uv run python -m tools.generate --date 2026-10-14-tracks-large --type train-tracks # 12x12
uv run python -m tools.publish  --out ../app/public/puzzles   # fill the archive
uv run python -m tools.verify   --dir ../app/public/puzzles   # replay every committed file
uv run python -m tools.benchmark_tracks --out /tmp/tracks-probe.json # probe 8/10/12 boards
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
  "board": {"size": 3, "regions": [0, 0, 0, 1, 1, 2, 2, 2, 2]},
  "difficulty": 4
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


## Contribution naming

Use purpose-based branch prefixes such as `feat/word-paths-gameplay` and
`fix/mobile-tracing`. Pull request titles use the matching `feat:` or `fix:`
prefix. Feature PRs are reviewed and merged by the maintainer.
