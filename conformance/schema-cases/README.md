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

## Two fixtures that look like mistakes

They are not. Both pin a way the two languages can disagree about the same bytes:

- **`integral-float.accept.json`** writes `4.0` where an integer is expected, and the
  suite requires it to be **accepted**. JSON Schema 2020-12 counts a number with a zero
  fractional part as an integer. Python's `json.loads` returns a `float` for it while
  ajv hands TypeScript a plain `number`, so a parser that requires `isinstance(x, int)`
  accepts `4` and rejects `4.0` — a divergence the schema does not license. Generated
  files never contain these; the case exists to stop the parsers drifting.
- **`generator-version-unsafe.reject.json`** uses `9007199254740993`, two above
  `Number.MAX_SAFE_INTEGER`, and the suite requires it to be **rejected**.
  `JSON.parse` rounds it to `...992` before the app ever sees it, so the browser would
  attribute the puzzle to the wrong generator. Capping the field in the schema is what
  makes that impossible; the fixture proves the cap holds.
