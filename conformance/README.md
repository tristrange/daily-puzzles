# Conformance fixtures

Fixtures that **both** implementations must agree on: the Python engine in `engine/` and
the TypeScript app in `app/`. A polyglot codebase has two chances to misread the same
rule, so every shared claim is pinned here and asserted from both sides.

## Suites

| Directory | Asserts | Introduced in |
| --- | --- | --- |
| `schema-cases/` | The JSON file format is accepted or rejected as expected. Structure only. | M1 |
| `board-cases/` | Full board semantics: region validity, and (from M2) solution count. | M2+ |
| `hint-cases/` | The *first forced move* the deduction rules produce, from an empty board or an explicit player state. | M6 |
| `id-cases/` | Puzzle id naming: each family's suffix, and which day and family an id names. | M3 |

These are deliberately separate. `schema-cases/` proves the two languages parse a file
identically; `board-cases/` proves they *reason* about a board identically; `hint-cases/`
proves the app's live hint engine and the engine's own solver deduce the same first move.
A board can be structurally valid and logically broken, so the suites must not be
conflated.

`id-cases/` exists because the two sides name ids for opposite reasons. The engine's
`puzzle_id` writes the name the publisher will use; the app's `puzzleTypeOf` routes it.
A spelling they disagree on is not a crash — it is a puzzle that is published,
correct, and unfindable, so the agreement is asserted rather than reviewed.

`hint-cases/` is worth one precise caveat. A "subset" firing can only ever occur *after*
some cells are already dead (on an untouched board every region, row and column has a full
candidate set, so the pigeonhole never triggers), which is why a subset case ships an
explicit player state — the marks the player has already made — rather than an empty
board.

## Running

Both suites run as part of each language's normal test command:

```sh
cd engine && uv run pytest
cd app    && npm test
```

If a fixture changes, it must be updated in the same commit as whichever code change
motivated it, and both suites must go green in the same commit.
