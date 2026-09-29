# Conformance fixtures

Fixtures that **both** implementations must agree on: the Python engine in `engine/` and
the TypeScript app in `app/`. A polyglot codebase has two chances to misread the same
rule, so every shared claim is pinned here and asserted from both sides.

## Suites

| Directory | Asserts | Introduced in |
| --- | --- | --- |
| `schema-cases/` | The JSON file format is accepted or rejected as expected. Structure only. | M1 |
| `board-cases/` | Full board semantics: region validity, and (from M2) solution count. | M2+ |

These are deliberately separate. `schema-cases/` proves the two languages parse a file
identically; `board-cases/` proves they *reason* about a board identically. A board can
be structurally valid and logically broken, so the suites must not be conflated.

## Running

Both suites run as part of each language's normal test command:

```sh
cd engine && uv run pytest
cd app    && npm test
```

If a fixture changes, it must be updated in the same commit as whichever code change
motivated it, and both suites must go green in the same commit.
