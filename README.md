# Daily Puzzles

A daily logic-puzzle web app. Inspired by LinkedIn Queens, built from scratch: a Python
engine that generates and proves puzzles, and a static TypeScript/React app that plays
them.

There is no server, no database and no account. The entire product is a static site plus
a directory of committed puzzle files.

Two games ship: **Queens**, the daily puzzle, and **Star Battle**, the second puzzle type,
published every day alongside it. Each day has its own solve for each.

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

## Deployment

The site is published to GitHub Pages by the `deploy` job in `ci.yml`, on every push to
`main`, at:

```
https://<user>.github.io/daily-puzzles/
```

Three things about that arrangement are worth knowing.

**The deploy waits for the other two jobs.** `needs: [engine, app]` means the puzzle
verification has to pass before anything is published, so a malformed puzzle file can be
committed to `main` without a site going out that serves it. That is the reason the job
lives in `ci.yml` rather than in a workflow of its own: it reuses the verification instead
of repeating it.

**The daily publisher has to ask for the deploy explicitly.** This is the one part of the
arrangement that is counter-intuitive. A commit made with the default `GITHUB_TOKEN`
raises no workflow event at all, by design — GitHub suppresses it so a workflow cannot
re-trigger itself. So the `git push` in `publish.yml` publishes the puzzle and, on its
own, would never verify it or deploy it: the site would go stale every night while the
repository carried on looking perfectly healthy.

So after a successful push the publisher dispatches `ci.yml` on `main`, which needs
`actions: write` and a `workflow_dispatch` trigger to be allowed. It dispatches the whole
workflow rather than a deploy-only one, so the nightly puzzle gets the same engine
verification a human push does — a gap that was there before Pages existed, because those
commits were never running CI either.

**The build knows it is served from a sub-path.** A Pages *project* site lives at
`/<repo>/`, not at the domain root, so the deploy step sets `BASE_PATH` and
`app/vite.config.ts` reads it. Every asset URL and the app's own puzzle fetches derive from
it, which is the same `BASE_URL` the share link reads — see [Share text](#share-text). A
local `npm run build` with no `BASE_PATH` still builds for the root, so nothing about
local development changes.

**No SPA rewrite is needed.** The app routes on the hash, so the server only ever sees a
request for `/daily-puzzles/`; the route lives in the fragment. Every link the app emits
therefore survives being pasted anywhere, and there is no 404 page to keep in step with the
routes. The `gh-pages` branch and Jekyll are absent too: `actions/deploy-pages` serves the
uploaded artifact directly.

If the repository is renamed, the deploy follows automatically — `BASE_PATH` is derived
from `github.event.repository.name` rather than written down. A repository that should be
served from the domain root instead (a `<user>.github.io` repository) would need that one
line changed.

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
| 9 | Stretch: share text, local stats, dark mode | done |
| 10 | Stretch: Star Battle as a second puzzle type | done |
| 11 | Both puzzles every day: a Star Battle companion per date, and the format work to carry it | done |
| 12 | A landing page that offers both of today's puzzles instead of assuming one | done |
| 13 | A How to play page, and the region star counts it needs to be able to point at | done |
| 14 | Remember the auto-mark choice between visits | done |

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

## The landing page

With two puzzles a day, the site's first question is which one to play, and the old
answer — render today's Queens board at `/` — made that decision for the player. `/` is
now a chooser: one card per game, each linking straight to its board under `/archive/:id`,
so choosing costs one click and the daily `/star-battle` shortcut disappears from the nav
because the chooser is now what the nav's "Today" means.

Nothing about the chooser assumes today is complete. The publisher writes a companion
after the Queens board, so a day mid-publish has one file and not the other; `probePuzzles`
reports a miss per id instead of rejecting, and the absent card says *Not published yet*
with no link, rather than the whole page failing over one absent file. A solve already
recorded for today turns that card's action into *Play again*.

The two family names lived in three copies — share text, archive and stats — which is
three places to forget a rename, so they now come from one table in `domain/games.ts`.

### How to play, and the counts it needed

Writing the rules page surfaced a display gap rather than a rules question. The engine has
always enforced region capacity — `solver.py` reads it off `Board.region_capacity` so the
solver and the validator cannot disagree — but `InteractiveBoard` never drew it. For Queens
that costs nothing, since every region holds exactly one. For Star Battle it hid the puzzle's
defining constraint, and it made an honest tutorial impossible: the page would have had to
describe a number that is not on the screen.

Each region's count is now drawn in its top-left cell, the first cell of the region in
row-major order, which is also where the genre puts it and where it does not collide with the
marker in the middle of the cell. Only counts above one are drawn. Printing `1` in all 64
regions of a Queens board would be 64 numbers saying nothing, so Queens renders exactly as
before, down to the byte in its cells' accessible names; Star Battle gains the digit and, in
each cell's label, the region it belongs to and what it owes.

The tutorial itself is at `/how-to-play`. Its one job is to correct an assumption rather than
recite a genre: **this app's Queens is not the puzzle most people meet under that name.** A
region holds exactly one piece *and* no two pieces touch, not even diagonally — the
no-touching rule is shared by both games and enforced by the same solver. A player arriving
from a familiar Queens loses to that second rule unless it is written down.

Every claim on the page was verified against a running board rather than assumed: the click
cycle, dragging, right-click, all eight keyboard bindings, auto-mark being off by default, a
drag counting as one undo step, and hints being absent from Star Battle.

Auto-mark is off by default, and stays off until someone asks for it: auto-mark draws
conclusions, and a cross the player did not draw is an answer they were given rather than one
they reached. Once asked for, the choice is remembered — it is a preference about how someone
plays, not a decision about one board, and re-asking every day would be a small daily tax for
no reason. It is stored like the theme choice, in one namespaced key that parses to `false`
for anything unrecognised, so a value from a future version cannot quietly start drawing
conclusions nobody consented to.
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

### Fitting the window

The board is `width: min(76vw, 480px, 54svh)`, and the third term is the one that earns
its place. At 480px the board is most of the page, so on a laptop it pushed the footer
below the fold: there was nothing to scroll *to*, which is the worst kind of scroll. The
board now yields to the viewport instead, and `svh` rather than `vh` because it is
measured against the smallest viewport, which is the one that has to fit.

One subtlety cost a real bug. Both `#root` and `.shell` claim `min-height: 100svh`, and
`#root` also had a bottom padding — so the page was a viewport-height box *plus* 24px of
padding, and the shell fitted perfectly while the footer still ended up off-screen by
exactly that padding. The spacing now lives on the footer, which is where it belongs.

The result, measured in WebKit (Safari's engine) at 1280×760, a MacBook Air's viewport
once the browser chrome is taken off: **0px of overflow, footer fully visible**, with the
board at 410px and 51px cells. At 1440×900 the 480px cap is the binding term and nothing
changes.

Solving still adds about 88px — the banner and the share buttons — so the solved state
overflows by that much on a short window. That is left deliberately: there *is* something
to scroll to, which is the distinction that matters.

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

### Local stats

M9 records what this browser has finished. There is no account and no server, so a solve
is written to `localStorage` the moment it happens and never revised afterwards — the
whole feature is a list of facts plus arithmetic over them, and the arithmetic is in
`app/src/lib/stats.ts` as pure functions that touch no globals, so the interesting part
is testable without a browser.

Two decisions are worth knowing:

- **The first solve of a day is the one that counts.** Replaying a puzzle leaves the
  record alone rather than overwriting it, because "when did you first get this" is what
  a streak is answering -- and because a second attempt at a puzzle you have already
  solved is played knowing the answer, so its time would flatter the record. The banner
  says so when it happens ("your first solve still counts") rather than silently ignoring
  the attempt. A duplicated or hand-edited file cannot invent a longer streak either: a
  repeated id keeps its earliest `solvedAt`.
- **An unplayed today does not break the streak.** A streak counts back from yesterday
  when today is still unsolved, so the number does not read zero every morning and become
  something a player stops looking at.

`mostRecentSolves` orders by `solvedAt`, not by puzzle id. The records themselves are
sorted by day, which is what the arithmetic wants, but "recently solved" is a statement
about the player: finishing an older archive puzzle today is the most recent thing they
did, and sorting by its date would file it at the far end of the list.

Hints are counted when one is *shown*, not when one is asked for: a request with nothing
forced to say is not help, and counting it would make the stat a measure of nerves.

Stored data is treated as untrusted, like the theme's. Every field is checked rather than
cast, so a truncated write or a record from a future version drops that one record
instead of putting `undefined` in the middle of a streak calculation — and the rest of
the history survives.

**It can be deleted.** A feature that keeps a record of what you have played has to offer
a way to forget it — on a shared machine the history outlives the session, and a streak is
the sort of thing a player may simply want to start over. `clearStats` removes the key
rather than writing an empty list, so a cleared player leaves no artefact of having had
one, and it touches nothing else: the theme lives under its own key, and losing a
preference you set once because you cleared your solves would be its own small betrayal.
The control takes two clicks and says plainly that it cannot be undone, because it cannot
be — and the outcome is announced, since the page swaps to its empty state in the same
render that needs to say so.

The storage wrappers in that module are the only code in `lib/` that touches a player's
data, and they are covered directly: a `localStorage` stand-in exercises reading, writing,
a value that cannot be parsed, a store that throws on *access* as private browsing does,
and clearing.

### Share text

The last M9 item. Finishing a puzzle offers **Copy result** and **Copy with solution**.

**The default does not contain the board.** That is the whole design. A daily puzzle is
only worth sharing because a friend has not done it yet, and a share that prints where
the pieces went has already done their work for them — it is the opposite of a
challenge. Wordle gets away with a grid because the grid encodes *feedback*; ours encoded
the *answer*. So the plain share carries only what describes how the solve went: the
puzzle and its size, the time, the hint count, the streak, and a link. None of that gives
the puzzle away, and `share.test.ts` asserts the text contains no run of cell glyphs at
all — a grid is exactly the sort of thing that otherwise gets added back as a nice touch.

The board is still there, behind a button that says what it is, for showing a solution to
someone who has already finished it or who asked for one. It is a separate function taking
the board and the pieces rather than a flag on the first, so the spoiler has to be asked
for by name and the default cannot grow one by accident.

The text is built by pure functions in `app/src/lib/share.ts`, because the shape of the
output is the part worth testing: a time that reads the way the timer reads, a link that
opens the same puzzle, and a board that is `size` rows of `size` cells when — and only
when — a board was asked for.

Three decisions that are not obvious:

- **The link is built from where the app is actually served.** It puts the route after
  the `#` — the app routes on the hash, so `https://host/app/archive/2026-09-30` would
  be the site root and quietly show *today's* puzzle — and it takes the sub-path from
  Vite's `BASE_URL`, the same value `puzzleUrl` uses to find puzzle files, so a share
  link and a puzzle fetch cannot disagree about where the site lives. A project page on
  GitHub Pages is served from `/<repo>/`, where the origin alone would drop the
  repository. It links to the archive entry rather than the daily route because a share
  is most often read later, when "today" is a different puzzle.
- **Empty cells are black squares, not white.** Both cell glyphs are the same emoji
  family and the same advance width — measured, not assumed, since a mismatch shears
  the whole grid — but a white square is invisible on the light background chat
  clients default to, and a share that has lost its empty cells reads as scattered
  dots. The failure box in the app previews the text on a light background for the
  same reason.
- **A failed copy shows the text instead of pretending.** `navigator.clipboard` is
  absent outside a secure context and can be refused, so there is a fallback to
  `execCommand`, and if that fails too the text appears in a selected, read-only box
  to copy by hand. A copy that silently fails is the worst kind: the player walks
  away believing they have something to paste. Both outcomes are announced, not just
  shown on the button.

### The daily pipeline


M8 closes the loop the samples were propping open: the archive publishes itself. Two
tools and two workflows do it.

```sh
cd engine
uv run python -m tools.publish --out ../app/public/puzzles   # fill the gap to lead days ahead
uv run python -m tools.verify --dir ../app/public/puzzles    # replay every committed puzzle
```

`tools/publish.py` scans the archive for missing puzzles and fills them from the first
missing day through today plus a `--lead` (default 3). It writes **two puzzles per day**:
the Queens board named after the day, and its Star Battle companion named
`<date>-star.json`. Both use a seed hashed from the id, size 8, but they are gated
differently, because they can promise different things. Queens walks the seed upward
until `deduce` reaches a solution without guessing, exactly as
`tools/generate --logic-only` does. A star board cannot: `deduce` is single-star and
refuses a star board outright, so the companion takes the guarantee the generator
actually provides — a unique solution — and says "unique, not logic-gated" rather than
printing a difficulty number that would mean something weaker than the same number on a
Queens board.

Skipping is per puzzle rather than per day, which is what makes this safe to run against
an archive published before companions existed: a committed Queens board does not stop
its missing companion from being filled in.

It is idempotent by construction: an existing file is never rewritten and an id always
maps to one puzzle, so running it twice in a day is a no-op and a missed week self-heals
on the next run. `tools/verify.py`
re-parses every committed puzzle and calls `verify_replay` on it, so a generator change
that would have drifted the archive fails loudly before anything is merged.

The workflows live in [`.github/workflows/`](.github/workflows):

- `ci.yml` runs on every pull request and push to `main`: the shared-engine gates
  (pytest, pyright, ruff) plus `tools.verify` over the committed puzzles, and the app
  gates (vitest, typecheck, oxlint, build).
- `publish.yml` runs from a daily cron (and by hand via `workflow_dispatch`): generators
  and verifies the missing dates, then commits and pushes only when the diff is non-empty,
  so the archive and `git log` tell the whole publishing story.

### The second puzzle type

Star Battle shares nearly everything with Queens, and the design paid off in
exactly the places the README claimed it would. The rules change from *one*
star per row, column and region to *k*; everything else — no two stars touching,
`size` regions, unique solution, the whole file format — is identical. The
solver was already capacity-parameterised, `Board` already carried a
`region_capacity`, the schema already required `regionCapacity` for
`type: "star-battle"`, and both parsers already defaulted it. The generator was
the last Queens-only piece.

So the real cost of adding a puzzle type was not the engine, it was the honest
inventory of what is *not* general. The deduction engine models "this line has
one candidate left" with boolean flags and wipes a region when a queen lands —
all single-star thinking. Rather than half-generalise it, Star Battle ships with
the guarantee it can actually back: a **unique** solution, but neither
logic-gated nor difficulty-scored (`deduce` refuses the board outright, and the
CLI says so). Extending the rules to k stars is future work with a real design
question behind it — a region with two candidates is not a single — and it will
be measured, not guessed.

Two facts the star path depends on. First, **not every size admits a star
count**: two non-touching stars per row need a row span of three columns and
each row shadows its neighbour, so within the generator's 5–9 range only 8x8 and
9x9 admit two stars per row (three stars need at least 12x12, beyond the range).
A brute-force search over row combinations confirmed the table, and
`generate_puzzle` fails fast on impossible combinations rather than burning
20,000 attempts discovering that. Second, `generatorVersion` is part of the
contract: Queens is version 1 (frozen — the committed files replay through the
exact PRNG stream that made them) and Star Battle is version 2, a separate
placement function that cannot perturb the version-1 draws. A new star layout
bug would be caught by `verify_replay` in CI before it reached a player.

### Playing a star

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

### Playing with a mouse

The keyboard was the first interface and it still is: every action has a key,
and a click is a convenience rather than a rule the keyboard has to pay for. A
left click therefore cycles a cell through **empty → mark → piece → empty**,
which is the shortest path to the two things a player does most — cross a cell
out, and commit to a cell — without ever needing a modifier. Right-click keeps
its old meaning of toggling the mark directly, so muscle memory from the first
build still works.

Pressing and dragging paints marks across every cell the pointer crosses, which
is how you cross out a row in one motion instead of eight clicks. The stroke
takes its direction from where it started: begin on a cell that is already
marked and it erases for its whole length, begin anywhere else and it marks.
Re-dragging along a stroke you did not mean is therefore the correction, rather
than hunting for Ctrl+Z. A press that never leaves its cell is a click and
cycles as above.

**A stroke never touches a piece**, in either direction. Dragging out a run of
exclusions should not un-place a queen on the way, and nothing about the gesture
says that it might, so `paintStroke` refuses both of its targets: the `mark` one
that paints a cross, and the `empty` one an erase stroke carries — guarding only
the first left an erase stroke sweeping pieces off the board just as
destructively. A stroke that crossed nothing but pieces therefore changes
nothing, and so adds no undo entry. Pieces are still removed by clicking one,
which cycles it away, or by the keyboard's clear: both are deliberate acts on a
cell the player aimed at, unlike passing over one.

Undo granularity is the part worth stating plainly. Painting a cell is live
feedback, but the board reports the whole *gesture* to the view rather than the
individual cells: the view snapshots on `onGestureStart` and pushes exactly one
history entry on `onGestureEnd`, with a click applying its cycle from the
pre-press snapshot. So one drag across eight cells is one Ctrl+Z, and eight
clicks are eight.

Pointer events do the work rather than mouse events, with
`document.elementFromPoint` to find the cell under the cursor — touch implicitly
captures the pointer to the first cell touched, so the event target is not the
one being painted. `touch-action: none` and `user-select: none` on the board keep
a stroke from turning into a scroll or a text selection.

### Theme

The app follows the operating system by default, which for anyone whose machine
switches at dusk is the behaviour they want and never have to think about. The
header adds a three-way control — **Auto**, **Light**, **Dark** — for anyone
who would rather pin it, and Auto stays the default rather than becoming a
"system" mode you have to opt back into.

What is stored is the *choice*, not a resolved light or dark value, and that one
decision removes most of the code. `data-theme` is set to `system`, `light` or
`dark` and the stylesheet does the rest: `color-scheme` on the root decides
which side of every `light-dark()` pair is used, so the app carries **one** set
of values rather than a light block, a dark media query and a dark override. The
alternative needs the dark values written twice, and two copies of a palette are
exactly the kind of thing that silently drifts apart. `color-scheme` also keeps
scrollbars and form controls in step, which swapping colours alone would not.

Nothing listens for OS changes, because nothing needs to: with the attribute
absent or set to `system`, the media-query behaviour of `color-scheme` keeps
tracking the OS on its own. A stored value that no longer parses falls back to
`system` rather than leaving the app in a theme it has no colours for, and
`localStorage` access is wrapped because private browsing throws on *read*, not
just on write.

A small inline script in `index.html` applies a pinned choice before the first
paint, so a player who has chosen dark does not get a flash of white while the
bundle loads. It only writes an explicit choice — with nothing stored the
attribute is left absent, which already means Auto.

Region colours are deliberately independent of all this. The board picks its
glyph ink per region rather than per theme, because the palette spans light sand
to near-black and neither theme's fixed marker colour is readable on all of it.

### Region colours

Regions used to be coloured `regionId % palette.length`, which knew nothing
about where the regions were. Two near-identical swatches could end up sharing
an edge — `#219ebc` and `#2a9d8f` are 0.068 apart in OKLab, `#f4a261` and
`#eaac8b` 0.046 — and against a shared border they read as one shape.

`lib/colours.ts` keeps the palette exactly as it shipped and only changes the
assignment. Distance is Euclidean in OKLab, which tracks human judgement far
better than RGB does, and neighbours include diagonals, because two regions
meeting at a corner point are as easy to misread as two sharing an edge. The
assignment is then *climbed* rather than guessed: the old mapping plus one
greedy pass per palette rotation are each improved by trying every colour for
every region until nothing helps, and the best result wins. A single greedy pass
is not enough — how many colours a region must avoid depends on how many
*distinct* colours its neighbours hold, and three neighbours on three swatches
can rule out nearly the whole palette.

Candidates are ranked on three things in order: clearing a minimum distance of
0.2 (over four times the worst pair the old mapping could place side by side),
then using more distinct colours, then the narrowest border. The second term is
why a solved board still gets eight colours for eight regions rather than the
three that a pure contrast objective settles for. Reuse survives on denser
boards, where it is free: a player identifies a region by the cells around it.

**When the climb cannot clear the floor, an exact search does.** Climbing is a local
search: it recolours one region at a time and keeps only changes that improve the score,
so it cannot step past a configuration where every single-region change makes something
else worse. The first day that proved it was `2026-10-04`, published by the nightly
pipeline — the climb settled on a touching pair 0.19988 apart against a floor of 0.2,
which failed the suite and blocked every deploy. A backtracking search, assigning
most-constrained region first and preferring an unused colour, found a valid assignment
in nineteen steps, so the floor was never the problem: the search was.

It only runs when the climb has already failed, and that is deliberate. Handing it a
board the climb handles would repaint days people have already played, for no gain — the
colours exist only to tell touching regions apart, and where that already holds there is
nothing to improve. A step budget bounds it regardless, so a board pathological enough to
exhaust the search costs time rather than hanging the page; `colours.test.ts` measures
the densest board the app can build (8×8 in 2×2 blocks, 16 regions) at about 11ms.

`colours.test.ts` asserts the floor against **every committed puzzle** rather
than a fixture, so a palette edit that quietly reintroduces two look-alike
swatches side by side fails there instead of in front of a player. That is also
what caught the `2026-10-04` board, and both that day's assignment and an older
one are pinned, so neither can drift.

The *piece* is not coloured per region, though the palette would justify it: the same
span that stops `#1a1a1a` working on `#023047` means a piece that adapts to its cell
looks, to a player, like a piece that is somehow in a different state — and the first
time one appeared light, it read as a mistake. So the piece is one fixed white with a
thin dark outline, identical in both themes and on every region. The outline is load-
bearing rather than decorative: a flat white reaches only 1.37:1 on the pale sand
`#e9c46a`, and the dark edge carries it there at 13.85:1, while the fill carries the
dark end. Worst case across all sixteen regions, one or the other clears 4.6:1, and
`colours.test.ts` asserts that for every colour in the palette — plus that the outline
really is applied, since without that check the two tokens could pass every test while
the stylesheet stopped using one of them.

The cross-out mark does still take its colour per region, because unlike the piece it has
no outline to fall back on. Choosing by a luminance threshold is what used to pick it,
and that failed on half the palette: a mid-red cannot clear 3:1 against a mid-tone region
however it is chosen, and against `#b56576` a red has to be at or below luminance 0.033 or
at or above 0.7, with every comfortable red in between. So `#b3261e`/`#f87171` left 8 of
the 16 regions short, as low as 1.58:1.

The two inks are now a near-black red and a pale one, and the choice is made by
*measuring* — whichever contrasts higher against this background — so the guarantee is
simply that the better of the two clears 3:1, which `colours.test.ts` asserts for every
region in the palette. Worst case 4.08:1. The cross is therefore darker than it was on
most cells; that is the cost of the guarantee, and the × glyph still carries the meaning.

---

## Conventions

- Commits are concise and imperative, e.g. `Add solution counter`.
- Every puzzle file is committed. Puzzle history is visible in `git log`.
- No databases, auth, ORMs or task-runner monorepo. If a change needs one of those,
  the scope has crept and the plan needs revisiting.
