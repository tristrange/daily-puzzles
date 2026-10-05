# schema-cases

`manifest.json` lists every case:

- `valid: true` — the file **must** validate against `schema/puzzle.schema.json`, and
  parse to the values in `expect`.
- `valid: false` — the file **must fail** validation, and the rejection must name the
  document locations in `errorPaths`.

Each case is stored as a bare puzzle file, with no metadata fields mixed in, so the
fixtures are exactly the shape a real committed puzzle has. The manifest keeps the
expectation out of the data.

`errorPaths` is a *set* of rules, each `keyword:path` or `keyword:path:property`, and
both languages build the same one:

```
"required:<root>:regions"
"additionalProperties:<root>:solution"
"minimum:regionCapacity/0"
```

A path alone would not do. `required`, `additionalProperties` and a failing `if` all fire
at the document root, so three distinct rules shared one expectation and a parser
rejecting `extra-property` because `regions` was missing still passed. Naming the
keyword, and the property it objected to, is what pins the rule.

Two details make the two validators comparable. ajv reports a failed `if` as its own
error naming `then`, where jsonschema descends into the `then` subschema and reports only
what is wrong inside it; the wrapper carries nothing the inner error does not, so both
parsers drop it. And a document can break several rules at once, so the set is
deduplicated and sorted rather than compared in order.

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
- **`star-battle-two-stars.accept.json`** declares `regionCapacity: [2, 2, 2, 2]`. The
  other accepted Star Battle fixtures all declare `[1, 1, 1, 1]`, which a parser that
  ignored the declared capacity and substituted the default would reproduce exactly. Only
  a non-default capacity distinguishes "read the file" from "invented the array".
- **`generator-version-unsafe.reject.json`** uses `9007199254740993`, two above
  `Number.MAX_SAFE_INTEGER`, and the suite requires it to be **rejected**.
  `JSON.parse` rounds it to `...992` before the app ever sees it, so the browser would
  attribute the puzzle to the wrong generator. Capping the field in the schema is what
  makes that impossible; the fixture proves the cap holds.
