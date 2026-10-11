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

Two of those fixtures are star battle for the same reason. The non-uniform capacity
one only describes a board where regions hold different numbers of stars, and the
region-count one only describes a board whose regions are not one per row; Queens
puts exactly one queen in each of `size` regions, so neither rule can fail there.

`tracks-type-on-a-marks-board.reject.json` is the one fixture whose subject is the
type rather than the geometry. `Board` models regions, capacities and one square;
Train Tracks plays a grid with none of those, so a `Board` naming that family is a
board the marks solver would otherwise accept as a valid puzzle of a game it cannot
express. Both validators reject it before consulting any region rule, and the
fixture is what keeps them agreeing on that.

## Relationship to the other suites

`schema-cases/` proves the two languages *read the same bytes*. This proves they
*reason about the result* identically, which is where each language has its own copy
of the rules — `validate_board` and `validateBoard` are line-for-line ports with no
shared test, which is the gap this suite fills.
