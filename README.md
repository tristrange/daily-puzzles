# Daily Puzzles

Six daily puzzle games and a Sudoku preview, built as a portfolio and learning
project. A Python engine generates and verifies original boards; a React and
TypeScript app plays them in the browser. The site is hosted on GitHub Pages.

**[Play Daily Puzzles](https://tristrange.github.io/daily-puzzles/)** ·
[Rules](https://tristrange.github.io/daily-puzzles/#/how-to-play) ·
[Archive](https://tristrange.github.io/daily-puzzles/#/archive)

Playing needs no account or backend connection. Progress, settings and personal
stats stay in your browser. Optional anonymous leaderboards use a separate
Supabase backend.

## Games

| Game | Daily board | Rules in brief |
| --- | --- | --- |
| **Queens** | Variable size, rated difficulty | One queen in each row, column and coloured region. Queens cannot touch, including diagonally; sharing a longer diagonal is allowed. |
| **Star Battle** | 9×9, two stars per group | Two stars in each row, column and region. Stars cannot touch, including diagonally. |
| **Train Tracks** | Small 8×8, Medium 10×10 and Large 12×12 | Connect the two edge endpoints with one unbranched track, matching row and column counts. All three sizes publish every day. |
| **Word Paths** | 5×5, English | Trace four orthogonal words of lengths 3, 4, 5 and 6, using every letter once without overlap. |
| **Trio** | 9×9 | Place three suns, moons and stars in every row and column. No three identical symbols consecutively; respect adjacent same/different clues. |
| **Tents** | 10×10, 18 tents | Pair trees with orthogonally adjacent tents, match row/column counts and keep tents apart, including diagonally. Each tree and tent must have a one-to-one pairing. |

Train Tracks sizes describe dimensions, not difficulty. New boards use every row
and column; older 7×7 boards remain playable with their original rules. The `?`
marker means definite track with an undecided shape and counts toward clues.

### Sudoku preview

**[Try Easy, Medium and Hard](https://tristrange.github.io/daily-puzzles/#/preview/sudoku?board=1)**
— one original 9×9 board per level, selected below the board. Sudoku is not yet
published daily.

Select a cell, then use the keypad or keyboard. Notes mark candidates; entering
a number removes it from peer notes in its row, column and box. Clear notes,
Undo/Redo and confirmed Reset are available. Selecting a number softly highlights
matching numbers and their rows/columns. Explained hints show remaining candidates
and keep supporting deductions expandable.

Each board has a verified unique solution and a complete logical solve. The
levels describe the techniques required by the project's solver and remain
provisional pending playtesting. Preview attempts save separately and never
count toward daily stats, streaks or leaderboards.

Earlier [Word Paths](https://tristrange.github.io/daily-puzzles/#/preview/word-paths),
[Trio](https://tristrange.github.io/daily-puzzles/#/preview/trio) and
[Tents](https://tristrange.github.io/daily-puzzles/#/preview/tents?board=7)
previews also remain available with separate progress.

## Playing features

- Responsive boards, keyboard controls, Light/Dark themes and Auto following the system.
- Saved unfinished attempts and active-play timers. Today offers Resume; Undo/Redo history belongs to the current visit. Reset asks for confirmation.
- Explained logic hints with target/support highlights and optional, undoable moves. Word Paths reveals a starting cell, then additional letters on request.
- Notes and Clear notes in Trio and Sudoku. Shown hint counts survive Undo, Reset and reload.
- Per-game archives and personal stats, first-solve times, daily streaks and shareable results.
- Optional per-puzzle leaderboards showing nickname, time and hints, accessible after solving and from navigation. Browsing requires no signup; joining uses an anonymous browser identity, without email or password.

Hints may stall when their supported techniques find nothing further; that does
not establish that guessing is necessary. Queens, Star Battle and Sudoku warn
before optionally revealing a mistaken entry. Other games report contradictions
found by their own checks. Notes are not proof for Trio/Sudoku hints; crosses,
grass and placed tracks can be assumptions in the games that use them.

Leaderboard results are reported by the client and are intended for casual play,
not cheat-proof competition. Backend setup and service limits are documented in
[the leaderboard guide](docs/leaderboard-setup.md). Normal puzzle play works
without that integration.

## Install and play offline

On iPhone, open the site in Safari and choose **Share → Add to Home Screen**.
After the first online visit, wait for **App ready offline**. Today downloads its
available daily boards; opening Archive downloads the puzzles it loads. Saved
boards can then be played without a connection. New or unopened daily puzzles
still need internet.

The installed app and Safari have separate progress and downloads. Open the
installed app online before relying on it offline. Clearing site data or browser
cache eviction can remove saved data; progress does not sync between devices.
Losing an anonymous leaderboard identity also loses self-service access to its
published results. When an update is ready, close every open app window and
reopen it to activate the update.

## Puzzle guarantees

Every daily board is checked for a unique solution. For Word Paths, uniqueness
means one complete cover within that board's frozen vocabulary, not every word
in the English language. A valid individual word can still lead to a dead end.

Queens and Trio daily generation also require logical completion. Tents uses an
offline line-pattern completion check. Star Battle and Train Tracks guarantee
uniqueness without claiming that the live hint engines can finish every board.
Sudoku previews have independent exact-solver and deduction certificates.

Seeds, generator versions and vocabulary versions preserve historical boards.
Published files are committed and replay-verified; existing archive files are
not rewritten when a generator changes. No solution arrays are shipped in
puzzle definitions. Validation and hints run locally; client-side computation
is not a security boundary.

## Architecture

```text
daily-puzzles/
  app/                  React, TypeScript and Vite; game UI and pure domain rules
    public/puzzles/     Committed daily puzzle JSON
  engine/               Python generators, exact solvers and deduction engines
  schema/               Shared puzzle-file schema
  conformance/          Shared parsing, rule, hint and identity fixtures
  backend/leaderboard/  Optional Supabase migrations, tests and catalog sync
  docs/                 Design notes, measurements, setup guides and build journal
```

The Python engine runs offline and in CI, not in the browser. The app reads its
JSON output and owns player state and live hints. Shared fixtures check agreement
between the two implementations. Puzzle definitions, saved progress and daily
assignment remain separate. Sudoku currently uses dedicated preview definitions
rather than the daily schema and publisher.

GitHub Actions fills missing daily slots, checks archive replay and deploys the
static site. App checks always run. Known frontend/documentation-only PRs skip
engine work; main pushes run full validation. Engine tests and archive replay
run in parallel, and deployment waits for both plus the app gate.

## Local development

Use **Node.js 22.12+** (CI uses Node 22). Python work additionally requires
**Python 3.13+** and **uv**. The app can run against committed puzzle data without
starting Python or configuring Supabase.

From the repository root:

```sh
cd app
npm ci
npm run dev
```

Open the URL Vite prints. For Sudoku, append `#/preview/sudoku?board=1`.

App checks and production preview, from `app/`:

```sh
npm test
npm run typecheck
npm run lint
npm run build
npm run preview
```

Engine setup and checks, from `engine/`:

```sh
uv sync --frozen
uv run pytest -q
uv run pyright
uv run ruff check .
uv run ruff format --check .
uv run python -m tools.verify --dir ../app/public/puzzles
uv run python -m tools.schema_ids --check
uv run python -m tools.sudoku_preview  # verify the three fixed preview certificates
```

For a Pages-style production build, set `BASE_PATH=/daily-puzzles/` when running
`npm run build`. See [engine usage](engine/README.md) for generation commands and
[pipeline documentation](docs/pipeline.md) before publishing new daily boards.

## Contributing and further reading

Keep changes focused and run checks appropriate to the affected code. Include
shared fixture updates with the behavior they describe. Use branches such as
`feat/new-game` or `fix/mobile-input`; feature/behavior PRs are reviewed and merged
by the maintainer. Repository workflow guidance is in [AGENTS.md](AGENTS.md).

- [App architecture and controls](docs/app.md)
- [Engine, difficulty and measurements](docs/engine.md)
- [Puzzle model and file format](docs/puzzle-model.md)
- [Publishing, CI and deployment](docs/pipeline.md)
- [Leaderboard setup](docs/leaderboard-setup.md)
- [Build journal](docs/journal.md)
