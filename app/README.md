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
