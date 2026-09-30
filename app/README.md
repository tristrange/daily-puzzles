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
is committed so the archive has content before the daily pipeline exists.

Routing uses `HashRouter` (the site has no server to rewrite paths for a
`BrowserRouter`):

- `/` renders today's puzzle in the player's time zone (`puzzleOfToday`).
- `/archive` lists published puzzles from the last 30 days.
- `/archive/:id` renders one puzzle, e.g. `#/archive/2026-09-30`.

`puzzleOfToday(date, tz)` and the loaders live in `src/domain/dates.ts` and
`src/lib/puzzles.ts` and are covered by `*.test.ts` suites.

## Playing

`src/domain/game.ts` owns the player's state for one board (queens and marks) as pure
transitions, plus `conflicts` detection between placed queens. `src/domain/hints.ts` is a
port of the engine's pure deduction rules, stopping at the first firing; the app's hint
is pinned to the Python engine by the `hint-cases/` conformance suite, asserted from both
languages (see `conformance/README.md`). No solution is ever shipped to the client.

`src/components/InteractiveBoard.tsx` renders the board as an ARIA grid with full keyboard
support:

- Arrows / Home / End move the focused cell (roving tabindex).
- Enter or Space place or take back a queen.
- `X` toggles an X mark; Delete/Backspace clears the cell.
- `H` asks for a hint.

Notifications (hint text, conflict warnings) go through a visually hidden `aria-live`
region so screen-reader users hear them without the whole grid being re-read.
