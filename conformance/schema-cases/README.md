# schema-cases

`manifest.json` lists every case:

- `valid: true` — the file **must** validate against `schema/puzzle.schema.json`.
- `valid: false` — the file **must fail** validation; `reason` states which rule rejects it.

Each case is stored as a bare puzzle file, with no metadata fields mixed in, so the
fixtures are exactly the shape a real committed puzzle has. The manifest keeps the
expectation out of the data.

Only *structural* rules belong here. JSON Schema cannot express "the `regions` array has
length `size * size`", so a short array validates cleanly — that kind of invariant is
asserted in `conformance/board-cases/` instead.
