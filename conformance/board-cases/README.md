# board-cases

`manifest.json` holds two sections.

- `cases` — a board that **must** construct (`valid: true`) or **must not**
  (`valid: false`, with `error` naming the rule that rejects it).
- `access` — a method call that must fail a particular way, for behaviour that is
  not about whether a board is constructible.

Each board is stored the way a puzzle file stores it, so the fixtures are the shape
the parsers actually receive. `error` is a substring of the message rather than an
exact string: the wording is allowed to improve, but the *rule* may not change
underneath the fixture.

## Why `error` is not just "it threw"

Several rules can apply to the same board. A queens board with a capacity of 0 is
both "capacity is not 1" and "capacity is below one", and on that board the first
rule fires. A suite asserting only that an error was raised would go green against
the wrong rule and quietly stop testing what it claims to, so each reject case
names the message it expects. Two fixtures are star-battle boards for exactly this
reason — on a queens board the capacity rule they exist to test is masked.

The divisibility fixture is a star-battle board too, but because it has to be.
Queens puts exactly one queen in each of `size` regions, so its capacities always
total `size` and the rule can never fail there; only a board whose regions hold
other numbers can describe a game with no whole stars-per-row.

## Relationship to the other suites

`schema-cases/` proves the two languages *read the same bytes*. This proves they
*reason about the result* identically, which is where each language has its own copy
of the rules — `validate_board` and `validateBoard` are line-for-line ports with no
shared test, which is the gap this suite fills.
