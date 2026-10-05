# Conformance fixtures

Fixtures that **both** implementations must agree on: the Python engine in `engine/` and
the TypeScript app in `app/`. A polyglot codebase has two chances to misread the same
rule, so every shared claim is pinned here and asserted from both sides.

## Suites

| Directory | Asserts | Introduced in |
| --- | --- | --- |
| `schema-cases/` | The JSON file format is accepted or rejected as expected. Structure only. | M1 |
| `board-cases/` | Board semantics: whether a board is constructible at all, which rule rejects it, and how out-of-range access fails. | M7 |
| `hint-cases/` | The *first forced move* the deduction rules produce, from an empty board or an explicit player state. | M6 |
| `id-cases/` | Puzzle id naming: each family's suffix, which day and family an id names, and that `schema/puzzle.schema.json` accepts the same set. | M3 |

These are deliberately separate. `schema-cases/` proves the two languages parse a file
identically; `board-cases/` proves they *reason* about a board identically; `hint-cases/`
proves the app's live hint engine and the engine's own solver deduce the same first move.
A board can be structurally valid and logically broken, so the suites must not be
conflated.

`board-cases/` also carries an `error` substring on every reject case, so the two
languages are pinned to the same *rule* rather than merely both refusing the board.
On a board where several rules apply, "it threw" would pass against the wrong one.

`id-cases/` exists because three places name ids for different reasons. The engine's
`puzzle_id` writes the name the publisher will use; the app's `puzzleTypeOf` routes it;
the schema's `id` pattern decides whether a file is a puzzle at all. A spelling they
disagree on is not a crash — it is a puzzle that is published, correct, and unfindable,
so the agreement is asserted rather than reviewed.

The schema's pattern is generated from the `types` block here by
`python -m tools.schema_ids`, which makes it a fourth consumer of the manifest rather
than a fourth hand-written list. `--check` is what CI and the publish job run: adding a
family to `types` without regenerating fails on the next run rather than rejecting its
own published puzzles. Its pattern is *shape*
only: it accepts `2026-02-30`, because JSON Schema cannot express "the day exists", and
`split_puzzle_id` rejects that in both languages. The two halves are asserted separately
so widening one does not quietly widen the other.

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
