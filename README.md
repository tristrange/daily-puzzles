# Daily Puzzles

Seven daily puzzle games, built as a portfolio and learning
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
| **Sudoku** | Easy, Medium and Hard, all 9×9 | Fill each row, column and 3×3 box with 1–9 exactly once. All three levels publish every day. |

Train Tracks sizes describe dimensions, not difficulty. New boards use every row
and column; older 7×7 boards remain playable with their original rules. The `?`
marker means definite track with an undecided shape and counts toward clues.

### Sudoku levels and controls

Easy, Medium and Hard publish separately each day from October 21, 2026.
The [three fixed preview boards](https://tristrange.github.io/daily-puzzles/#/preview/sudoku?board=1)
remain available for practice.

Select a cell, then use the keypad or keyboard. Notes mark candidates; entering
a number removes it from peer notes in its row, column and box. Clear notes,
Undo/Redo and confirmed Reset are available. Selecting a number softly highlights
matching numbers and their rows/columns. Picker digits dim at nine placements,
without claiming that the entries are correct. Drag over cells or use Shift-click
or Shift-arrow to select several; digits then update notes in empty selected
cells even with Notes off. A group edit takes one Undo. Explained hints show
remaining candidates and keep supporting deductions expandable.

Each board has a verified unique solution and a complete logical solve. The
levels describe the techniques required by the project's solver and remain
provisional project ratings. Each daily level has its own result and leaderboard;
streaks count calendar days once. Preview attempts save separately and never count
toward daily stats, streaks or leaderboards.

Earlier [Word Paths](https://tristrange.github.io/daily-puzzles/#/preview/word-paths),
[Trio](https://tristrange.github.io/daily-puzzles/#/preview/trio) and
[Tents](https://tristrange.github.io/daily-puzzles/#/preview/tents?board=7)
previews also remain available with separate progress.

## Playing features

- Responsive boards, keyboard controls, Light/Dark themes and Auto following the system.
- Saved unfinished attempts and timers that pause while the page is hidden or unfocused. Today offers Resume; Undo/Redo history belongs to the current visit. Reset asks for confirmation.
- Explained logic hints with target/support highlights and optional, undoable moves. Word Paths reveals a starting cell, then additional letters on request.
- Notes and Clear notes in Trio and Sudoku. Shown hint counts survive Undo, Reset and reload.
- Per-game archives and personal stats, with Sudoku level and Train Tracks size filters.
  Overall and per-game summaries show solve counts, average/fastest times, streaks and
  hints used. First solves count; results are shareable.
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

Queens, Trio and Sudoku daily generation also require logical completion. Tents uses an
offline line-pattern completion check. Star Battle and Train Tracks guarantee
uniqueness without claiming that the live hint engines can finish every board.
Sudoku levels have independent exact-solver and deduction certificates: Easy uses
singles; Medium adds locked candidates and pairs; Hard adds triples and X-wing.
Medium must require more than Easy techniques, and Hard more than Medium.

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
assignment remain separate. Sudoku uses the daily schema and publisher while
retaining its original practice definitions and separate preview saves.

GitHub Actions fills missing daily slots, checks archive replay and deploys the
static site. App checks always run. Known frontend/documentation-only PRs skip
engine work; main pushes always run engine checks. Engine tests and archive replay
run in parallel, and deployment waits for both plus the app gate.
Engine CI checks a ten-seed Word Paths sample; a weekly/manual job checks all 100.
Full archive uniqueness and replay verification still gate every deployment.

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

Open the URL Vite prints and choose a daily game. For Sudoku practice, append
`#/preview/sudoku?board=1`.

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
uv run python -m tools.verify --dir ../app/public/puzzles --jobs 2
uv run python -m tools.schema_ids --check
uv run python -m tools.sudoku_preview  # verify the three fixed preview certificates
```

`pytest -q` includes the full Word Paths seed sweep. For the same selection as
normal engine CI, use `uv run pytest -q -m 'not generator_sweep'`. To run just the
100-seed sweep, use
`uv run pytest tests/test_word_paths_contract.py -q -k independent_cover_solver`.

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
