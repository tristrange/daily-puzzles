# app

The player: React UI, game state, and the client-side hint engine. See the
[root README](../README.md) for the architecture, the puzzle rules, and the file contract
this app shares with the Python engine.

```sh
npm install
npm run dev        # dev server
npm test           # unit tests + shared conformance suite
npm run typecheck
npm run build
```

Puzzle files are read from `public/puzzles/`, written and committed by
`engine/tools/generate.py`. A week of sample puzzles (2026-09-27..2026-10-03)
is committed so the archive has content before the daily pipeline exists. All
of them are Queens; the app also plays any valid `type: "star-battle"` file, so
one can be tried locally without touching the committed archive:

```sh
cd ../engine && .venv/bin/python -m tools.generate \
  --date 2026-10-04 --type star-battle --out ../app/public/puzzles
# visit #/archive/2026-10-04, then delete the file again
```

Routing uses `HashRouter` (the site has no server to rewrite paths for a
`BrowserRouter`):

- `/` renders today's puzzles in the player's time zone and refreshes at local midnight (`useToday`).
- `/archive` lists published puzzles in 30-day windows, newest first; **Older** and **Newer** move between windows, and `?page=` keeps the window across refresh and Back.
- `/archive/:id` renders one puzzle, e.g. `#/archive/2026-09-30`.

Routes are lazy chunks around a static landing page. The optional Supabase
leaderboard client lives behind `components/LeaderboardGate.tsx`, mounted only
for puzzle, Star Battle and leaderboard routes, so it is not in the entry chunk
or the Home, Archive, Stats and Rules route chunks. The offline worker precaches
every emitted chunk, lazy ones included, so it can still arrive in the background
for offline use; it is not parsed until a gated route mounts it.

`puzzleOfToday(date, tz)` and the loaders live in `src/domain/dates.ts` and
`src/lib/puzzles.ts` and are covered by `*.test.ts` suites.

## Playing

`src/domain/game.ts` owns the player's state for one board (pieces and marks) as pure
transitions, plus `conflicts` detection between placed pieces, `placeQueenAutoMark`
(piece + the marks it justifies), `isSolved`, and `formatTime`.

The state field is called `queens` and a placed piece is called a queen, because
the hint contract is shared with the Python engine and the engine speaks of
stars. For a Star Battle board the same set holds stars, and the *rules* are
read off the board rather than hard-coded: `starsPerRow(board)` is
`sum(regionCapacity) / size` (1 for Queens, k for Star Battle). `conflicts` asks
whether a group is over capacity instead of whether two cells merely share it,
`isSolved` wants `size * starsPerRow` clean pieces, and `cellsEliminated` drops to
the eight touching cells for a star, since a star's row, column and region stay
open. See the root README for why the conservative auto-mark is the honest one.

`src/domain/hints.ts` is a port of the engine's pure deduction rules, stopping at
the first firing; the app's hint is pinned to the Python engine by the
`hint-cases/` conformance suite, asserted from both languages (see
`conformance/README.md`). Those rules are single-star, so `firstHint` returns
`null` for a Star Battle board and `PuzzleStage` does not render the Hint button:
no hint is better than a hint derived from the wrong rules. No solution is ever
shipped to the client.

`src/components/InteractiveBoard.tsx` renders the board as an ARIA grid with full keyboard
support:

- Arrows / Home / End move the focused cell (roving tabindex).
- Enter or Space place or take back the piece.
- `X` toggles an X mark; Delete/Backspace clears the cell.
- `H` asks for a hint (Queens only); Ctrl/Command+Z undoes.

The piece's glyph and name follow the board's puzzle type (♛ queen, ★ star), as
do the grid's and cells' screen-reader labels. The game loop around it lives in
`PuzzleView`'s `PuzzleStage`: a 100-move undo stack, a timer that freezes when
`isSolved` turns true (the board then locks), and an auto-mark toggle.
Notifications (hint text, conflict warnings, the solve time) go through a
visually hidden `aria-live` region so screen-reader users hear them without the
whole grid being re-read.


## Total and since-reset time

Every playable stage uses `usePlayClock` with one fractional focused-time counter.
`PlayTime.elapsedMs` remains the total used for ranking, statistics, and shares.
A confirmed Reset establishes a private baseline and exposes `attemptElapsedMs`.
The shared display labels Total and Since reset after that first reset.
Undo and Redo restore only the board. Completion freezes both times at the same
instant. Learn has no timer.

Progress keeps its existing keys, version, and board fingerprints. The optional
`attemptElapsedMs` field is absent on legacy data and before the first reset.
Zero records an actual reset, including one at zero total time. Valid optional
metadata survives the first solve, delayed leaderboard opt-in, and queued retry.
Malformed optional metadata is dropped without losing valid progress or scores.
Apply the [attempt timing migration](../docs/leaderboard-setup.md#upgrade-an-existing-project-for-reset-timers)
before deploying this app version.

## Word Paths preview

Run the app normally, then open `#/preview/word-paths` (also linked from How to
play). Choose one of ten version-2 5×5 boards. Drag and release to submit, or tap
letters and press Submit. Keyboard: arrows/Home/End move focus, Space selects,
Enter submits, Backspace removes a letter, Escape clears selection, Ctrl/Cmd+Z
undoes. Backtracking truncates the selected path.

Use each shown length and every letter once, with orthogonal paths and no overlap.
Version 2 accepts 16,781 frozen English words; version 1 retains its original
748-word list. The grid chooses its list from the file’s generator version. A locally accepted word may lead
to a dead end; Undo is available. No answers or client solver are bundled.

Preview progress is saved separately from daily attempts and never affects stats
or streaks. Accepted words, unfinished traces and visible active time survive
reloads. Completed progress is cleared for replay. Result shares reopen the same
preview board; the separate spoiler share includes words and paths.

The existing Auto/Light/Dark picker applies to the new board. Single-finger
tracing reserves the board gesture, with pinch zoom allowed. Browser pointer and
375px layout checks are recorded in `../docs/journal.md`. The maintainer has
confirmed that the preview works on a physical iPhone.

Daily Word Paths starts on 2026-10-15 with one English 5×5 board per day. It uses
the ordinary Today card, archive links and solve history. The initial seven files
cover October 15–21; earlier dates are not backfilled. Preview links and saved
progress remain separate, so trying the preview does not consume a daily solve.
Versioned progress keys preserve old attempts when previews change. Word-list
provenance and redistribution notices are available through How to play.
Previously fetched daily boards can be played offline after app-shell setup.


## Home Screen installation

`public/manifest.webmanifest` declares a standalone app with a stable relative
launch URL and scope. Identity defaults to the launch URL without its fragment,
so each hosting path remains a distinct app. Keep that launch path stable. `index.html` links the manifest and 180px Apple touch
icon through Vite’s `%BASE_URL%` replacement. Icons at 192px and 512px reuse the
four-cell brand mark in `public/favicon.svg`; all PNGs are opaque and the 512px
mark fits the maskable safe zone. No install prompt is added.

Verify production builds at both `/` and `BASE_PATH=/daily-puzzles/`; manifest,
Apple icon and favicon links must remain under the build base. Manifest icon
URLs resolve relative to the manifest. All routes stay in the existing hash
router. Installation instructions live in How to play.

The first visit requires internet. iPhone Home Screen storage is separate
from Safari; no progress migration is claimed. Auto/Light/Dark behavior is
unchanged. Validate actual Add to Home Screen and relaunch on an iPhone after
merge; a desktop viewport check does not prove installation.


## Offline support

The production-only `OfflineStatus` registers `sw.js` within `BASE_URL` and
announces app readiness after activation. Vite’s `build/offline.ts` emits the
worker from `offline/sw.js`, hashing the template, emitted HTML/code/styles and
explicit public shell files. Install requests bypass the HTTP cache to avoid
retaining an older HTML response in a new build cache. Lazy Word Paths code and its dictionary are
precached too. Development mode does not register a worker.

App caches are `daily-puzzles.app:<base>:<build hash>`. Navigation uses the
installed HTML to keep its chunk versions consistent. Updates use the normal
waiting lifecycle: the status line says when a new version is ready; finish the
game, then close every open app window and reopen. There is no forced activation
or reload. Activation removes only older app
caches for this exact base; neighboring apps and player data are untouched.

`src/lib/puzzles.ts` owns downloads separately in
`daily-puzzles.puzzles:<base>:v1`. It validates schema and requested ID before
saving; network failures, unsuccessful or invalid responses fall back to saved
responses, which are validated again. A valid network response takes precedence.
Storage denial/quota errors leave online play usable and show a download warning. Unfetched puzzles require
internet. Today fetches its slots; Archive fetches the selected window. There is
no background archive crawl or guarantee against browser cache eviction.
Existing player progress keys are unchanged, and all five games now resume
unfinished attempts; Undo history remains visit-local.

To verify, build and preview using the same base (`BASE_PATH=/daily-puzzles/`
for both commands, or omit for `/`). Visit online, wait for readiness, open a
board, stop only that preview process, and reload/play. Check an unsaved board
asks for internet, then restart the preview and reload to recover. Browser tests
and their limits are recorded in [the journal](../docs/journal.md).

### Retiring a deployed worker

Removing registration or deleting `sw.js` alone does not remove an installed
worker. Ship a network-only retirement worker at the same base-scoped `sw.js`
URL; let it install and activate through the normal waiting lifecycle. On
activation, delete only `daily-puzzles.app:<that exact base>:` caches, claim
clients and unregister itself. Do not delete puzzle downloads or localStorage,
force a reload, or delete other projects’ caches. Keep this retirement file
available so returning devices can receive it. A rollback needs the usual PR,
review and deployment, with compatible puzzle readers retained.
