# Conformance fixtures

Fixtures that **both** implementations must agree on: the Python engine in `engine/` and
the TypeScript app in `app/`. A polyglot codebase has two chances to misread the same
rule, so every shared claim is pinned here and asserted from both sides.

## Suites

| Directory | Asserts | Introduced in |
| --- | --- | --- |
| `schema-cases/` | The JSON file format is accepted or rejected as expected, that a rejection names the field that caused it, and that an accepted file parses to stated values. Structure only. | M1 |
| `board-cases/` | Board semantics: whether a board is constructible at all, which rule rejects it, and how out-of-range access fails. | M7 |
| `hint-cases/` | The *first forced move* the deduction rules produce, from an empty board or an explicit player state. | M6 |
| `id-cases/` | Puzzle id naming: each family's suffix, which day and family an id names, and that `schema/puzzle.schema.json` accepts the same set. | M3 |
| `band-cases/` | Difficulty band naming: every band's name, and that the range is a contiguous 1-based sequence both sides index as `level - 1`. | M15 |

These are deliberately separate. `schema-cases/` proves the two languages parse a file
identically; `board-cases/` proves they *reason* about a board identically; `hint-cases/`
proves the app's live hint engine and the engine's own solver deduce the same first move.
A board can be structurally valid and logically broken, so the suites must not be
conflated.

`board-cases/` also carries an `error` substring on every reject case, so the two
languages are pinned to the same *rule* rather than merely both refusing the board.
On a board where several rules apply, "it threw" would pass against the wrong one.
`schema-cases/` needed the same treatment for a different reason: JSON Schema lets one
document break several rules, and the two validators enumerate them differently, so the
cases carry the *set of rules* the rejection names (`errorPaths`, as
`keyword:path:property`) rather than a message, because three schema rules fire at the
document root and a path cannot tell them apart. Its accept cases carry `expect`, since a
parser that accepts a file for the wrong reason — reading `size` as a string, discarding
a declared capacity — has still got it wrong.

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

`band-cases/` is the same problem in a place where drift is silent by construction. The
engine's `LEVEL_NAMES` is what its CLI prints and what `tools/verify` reports a ramp
against; the app's `DIFFICULTY_LABEL` is what a player reads on the chooser card and the
archive. Both key off the same 1-based integer in the puzzle file, so renaming a band on
one side changes nothing that fails: the file still parses, the board still replays, and
`verify_replay` compares boards rather than labels. The symptom is that the engine calls a
board *Expert* while the archive card calls it *Hard*.

Like `id-cases/` it holds no fixture files, so both suites assert that the manifest is
the whole thing — a stray `.json` dropped beside it would sit unread and look like a test.
The other three suites instead carry a "every fixture file is listed in the manifest" check,
because there a file the manifest forgets is coverage that silently never runs.

Unlike `id-cases/`, this manifest is not the source for anything. The schema's `difficulty`
range is a hand-written `minimum: 1, maximum: 5`, so adding a band means editing four
places — the manifest, `LEVEL_NAMES`, `DIFFICULTY_LABEL` and the schema's bound. The suite
covers all four: both sides assert their registry against the manifest, and a fifth case
asserts the schema *accepts every band the manifest declares and rejects one past the
end*. That last one is why the bound cannot be quietly left behind — without it, a sixth
band added everywhere except the schema would pass every other assertion here and then
reject every puzzle using it, in both languages, at parse time, for a reason unrelated to
the puzzle. Generating the bound from the manifest the way `tools/schema_ids` does for the
id pattern would remove the fourth edit instead of catching its absence; that is a change
to the schema tooling and worth making deliberately.

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
