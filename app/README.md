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

- `/` renders today's puzzle in the player's time zone (`puzzleOfToday`).
- `/archive` lists published puzzles from the last 30 days.
- `/archive/:id` renders one puzzle, e.g. `#/archive/2026-09-30`.

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

