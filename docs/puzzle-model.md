# Generalizing the puzzle model for a third game

Status: proposal, not a plan. Nothing here is built. The purpose is to fix the
shape of the model *before* a third game lands, because both candidate games
break it in different places, and doing that twice is more expensive than doing
it once.

## 1. What the model is today

Every puzzle we ship is the same problem wearing different clothes:

> A square `size` x `size` grid partitioned into 4-connected regions. A solution
> is a **set of cells**, each holding at most one mark. The rules are **counts of
> marks per group** (row, column, region) plus a **pairwise conflict** between
> marks. Exactly one such set satisfies the rules.

`Board` (`engine/src/queens_engine/board.py`) holds the geometry and the
capacities and enforces the structural guarantees. Everything else is written
against that shape:

| Site | Assumption baked in |
| --- | --- |
| `Board` | square `size`; cells partitioned into regions; a region has a *count* capacity |
| `Puzzle` | one flat record that always carries `board: Board` and `size: int` |
| `validate_board` | branches on `PuzzleType.QUEENS` to demand `region_count == size` and all capacities 1. Pinned cross-language by `board-cases/` since M7, including which rule rejects a given board. |
| `solver.py`, `generator.py`, `deduce.py` | take a `Board`; a solution is `frozenset[int]` of cell indices |
| `deduce.py` | "groups" are rows, columns and regions, addressed by index into three parallel `need` lists |
| `difficulty.py` | scores a `Board` by simulating forced moves |
| `ramp.py` | `generate_ramped` hardcodes `puzzle_type=PuzzleType.QUEENS` |
| `schema/puzzle.schema.json` | flat, `additionalProperties: false`, `regions` **required**, `id` pattern allows only an optional `-star` suffix |
| `app/.../game.ts` | `GameState = { board, queens: Set<number>, marks: Set<number> }` |
| `game.ts:conflicts()` | hardcodes exactly four rules: `row`, `column`, `region`, `touch` |
| `game.ts:isSolved()` | `queens.size === starsPerRow * size && no conflicts` |

Two of those are load-bearing in a way that is easy to miss:

- **`isSolved` is a count, not a shape check.** It is correct for both current
  games only because the capacities sum to the same total as the rows do, so
  "right number of pieces and no conflicts" implies the pieces fill every line
  exactly. Any game whose win condition is not a per-line count has no
  expression here.
- **`deduce`'s group model is three fixed parallel lists.** `_group_count` (added
  in #29) papers over the *length* of the region list, but the model is still
  "exactly three kinds of group, each a flat array of cells with one need". Train
  Tracks has no groups at all, and Tango's groups are all-different rather than
  counted.

The measured, trace-stable part of this is worth protecting: 48/48 recorded Queens
traces are byte-identical, and `deduce` has 790 lines of sound-for-k reasoning.
Any generalization that rewrites it is trading a known-good engine for a
speculative one.

## 2. What the candidates need

Train Tracks is **verified** — the rules below were recovered from that site's
help text and its JavaScript, then confirmed by solving eight of its real puzzles
to a unique solution with row and column sums checking out. Tango is
**provisional** — I have not checked its rules against real instances yet, and the
row for it should be treated as a hypothesis to be tested, not a specification.

| Axis | Queens / Star Battle | Tango *(provisional)* | Train Tracks *(verified)* |
| --- | --- | --- | --- |
| Grid | `size` x `size` | 6 x 6 | `width` x `height`, often not square (6x7 … 12x12) |
| Regions | required, 4-connected | none | none |
| Cell state | empty, or one mark | one of 1…6, never empty | empty, or one of 6 pieces |
| Line rule | exactly k per row/col | each of 1…6 once per row/col | a *clue* per row/col, value varies |
| Between cells | 8-neighbour conflict | — | **edge reciprocity**: a piece's ends must be met by a reciprocal piece |
| Global condition | — | 3 shaded cells per row/col, holding the odd values | **one** path, exactly 2 ends, both running off the grid |
| Extra structure | — | shaded mask, link pairs with sums | — |
| Pre-placed | — | given values, link sums | given pieces; **both end pieces are always given** |
| Unique solution | one occupied set | one full assignment | one full assignment |

The two candidates are not variants of each other either. Tango is a
number-placement game with an all-different constraint; Train Tracks is a
local-relational game with a global topology constraint. The only thing they
share with the current games is the envelope around them.

## 3. The decision: do not build a general solver

There is a tempting move here — represent every game as "one value per cell over
a per-game alphabet" and make Queens a two-value game. That would unify the data
model completely, and it is wrong for now:

- It requires rewriting `deduce.py` and `solver.py` from a group-and-need model
  into a CSP, and would very likely change the Queens traces.
- The value it buys is speculative. One of the two candidates is verified
  (Train Tracks) and one is still a hypothesis (Tango). Building a framework to
  serve a hypothesis is how frameworks rot.
- The per-game *rules* are where the difficulty lives, and they are not
  uniform. Star Battle needed a different rule set from Queens; Tango's will
  differ again. A shared engine would have to be parameterised to the point of
  being a worse copy of each.

**So: share the protocol, not the implementation.** Each game keeps its own
solver, its own deduction engine and its own score. What they share is a
registry, so that adding a game means adding an entry rather than editing the
pipeline.

## 4. The generalization, in three layers

### L1 — geometry: a `Grid` contract

The only geometry concept both families genuinely share is "a rectangular array
of addressable cells". The two sides already spell that differently and this
proposal does not unify them, because the repo does not do that anywhere else:
`board.py` and `board.ts` are hand-mirrored and pinned to each other by the
`conformance/` suites, not by a shared interface. So the contract is conceptual
and gets written twice, in each language's own vocabulary:

| Concept | Python, `engine/src/queens_engine/board.py` | TypeScript, `app/src/domain/board.ts` |
| --- | --- | --- |
| width, height | **new**, derived from `size` | **new**, derived from `size` |
| cell count | `cell_count` | `cellCount` |
| address | `index(row, col)` | `index(row, col)` |
| coordinates | `coords(i) -> (row, col)` | `coords(i) -> { row, col }` |
| orthogonal neighbours | `orthogonal_neighbours(i) -> tuple[int, ...]` | `orthogonalNeighbours(i) -> number[]` |

So `Board` gains two derived properties on each side and is otherwise unchanged:

```python
@property
def width(self) -> int:
    return self.size

@property
def height(self) -> int:
    return self.size
```

It was worth being precise here, because a first draft of this section implied
that two properties were the whole of it. They are the whole of the *Python*
change, but the app's `Board` has no `width`/`height` either, and the shared grid
chrome the app reuses is TypeScript. A neutral single-signature contract would
have needed `cell_count` renamed as well.

Train Tracks gets its own `TrackGrid` in both languages implementing the same
concept, with `width != height` permitted — that is the one place it genuinely
diverges, and it is why the contract names width and height at all. `Board`
itself is **not** widened: it keeps square-only, keeps its regions, and keeps
rejecting a Train Tracks board, because pretending otherwise is what produced
the `region_count` bug in #29.

### L2 — engine: a per-type rulebook registry

One interface, four operations, one implementation per game:

```
parse(data) -> Puzzle              # structural + the invariants the schema cannot express
generate(seed, id, ...) -> Puzzle
count_solutions(puzzle, limit=2) -> int     # the uniqueness gate
deduce(puzzle, allow_guesses) -> SolveResult # hints, logic-only, difficulty
```

`ramp.py`, `tools/generate.py`, `tools/publish.py` and `tools/verify.py` call
through `rulebook_for(puzzle_type)` instead of branching. `Puzzle` becomes a
discriminated union — one variant per game, each holding its own payload — rather
than one record that must contain every game's fields.

The mark games keep their existing classes, behind the same interface. That is
the whole point: the refactor is additive.

### L3 — app: per-type state and a per-type registry

`GameState` stops being one shape. It becomes a union, and the mark variant is
today's shape unchanged:

```ts
type GameState = MarkState | TangoState | TracksState   // MarkState = { board, queens, marks }
```

`games.ts` already holds the right kind of thing — `PUZZLE_TYPE_LABEL` and
`PUZZLE_PIECE` are records keyed by type — so it grows into the registry a new
game registers with:

```
type -> {
  label, piece noun/glyph,
  rules prose,
  cell renderer,          # glyph, digit, track piece
  input handler,          # cycle, digit pad, piece rotate
  isSolved(state), conflicts(state),
  share renderer,
  hint engine | null,
  stats bucket,
}
```

`hints.ts` already returns `null` for anything but Queens, which is the correct
default: a new game ships with no hints rather than with wrong ones. That decision
is now the registry's `PUZZLE_TYPE_HAS_HINTS` table, read by both the engine's guard
and the UI's button — they were two independent branches on `'queens'`, which is
exactly how a family ends up with a visible hint button that returns nothing.

## 5. The file format

The envelope stays uniform and small; everything game-specific moves under one
`board` key whose shape is selected by the sibling `type`. These are JSONC, and
`/* … */` marks an elided run — the arrays abbreviated below are abbreviated in
this document, not in a real file.

The lengths in the table are **not** schema constraints, and it is worth being
explicit about why, because it is the one place this format cannot be
self-validating. JSON Schema's `minItems` and `maxItems` take fixed integers, so
they cannot relate an array's length to a sibling property. Enumerating supported
dimensions instead would mean one conditional branch per `size` for Queens and one
per `(width, height)` pair for Train Tracks, and `MIN_SIZE`/`MAX_SIZE` already run
2..16 — so fifteen branches growing to two hundred and twenty-five, to check
something a parser already checks in one line. So the relational checks live in
the parsers, which is where this format already keeps them: `puzzle.py` checks
`len(regions) == size * size` and `board.ts` mirrors it, and the `conformance/`
suites pin the two against each other. Extending that pattern is the whole of the
work, and a new game inherits the arrangement rather than inventing one.

| Field | Length | Enforced by |
| --- | --- | --- |
| Queens / Star Battle `regions` | `size * size` | parser |
| Queens / Star Battle `regionCapacity` | region count | parser |
| Tango `givens`, `shaded` | `size * size` | parser |
| Train Tracks `givens` | `width * height` | parser |
| Train Tracks `rowClues` | `height` | parser |
| Train Tracks `colClues` | `width` | parser |

```jsonc
{
  "id": "2026-11-02", "type": "queens",
  "seed": 1710439114, "generatorVersion": 1, "difficulty": 2,
  "board": { "size": 8, "regions": [ /* 64 */ ], "regionCapacity": [ /* 8 */ ] }
}
```

```jsonc
{
  "id": "2026-11-02-tango", "type": "tango",
  "seed": 2748193021, "generatorVersion": 1, "difficulty": 3,
  "board": {
    "size": 6,
    "givens": [ /* 36 */ ],
    "shaded": [ /* 36 */ ],
    "links": [[0, 1, 7], [2, 8, 5]]
  }
}
```

```jsonc
{
  "id": "2026-11-02-tracks", "type": "train-tracks",
  "seed": 993024471, "generatorVersion": 1, "difficulty": 2,
  "board": {
    "width": 9, "height": 7,
    "rowClues": [5, 5, 5, 5, 5, 5, 4],
    "colClues": [4, 4, 4, 4, 4, 4, 4, 4, 2],
    "givens": [ /* 63 */ ]
  }
}
```

The clue values are not arbitrary. A row holds `width` cells and a column holds
`height`, so every `rowClues` entry must be at most 9 and every `colClues` entry
at most 7, and because both sets count the same track cells the two totals must
be equal — 34 each above. An earlier draft of this example carried a column clue
of 8 on a 7-row board, which no solution could satisfy, and whose total did not
match the row clues either. Both are parser checks, and both are the kind of thing
that should be caught when a file is read rather than when a puzzle is published.

So the schema does the part it can do: hold `additionalProperties: false` inside
each `board` shape, fix which fields a type requires and which it must not carry,
and bound values independently of dimension — integers in range, `links` entries
of exactly three integers, the `type` enum. Everything relational goes to the two
parsers, mirrored and pinned by conformance, which is the arrangement the format
already uses. A new game therefore arrives with a fixed split:

| | Checked in the parser |
| --- | --- |
| Train Tracks | array lengths per the table; every clue within its line's length; `sum(rowClues) == sum(colClues)`; exactly two cells of `givens` hold a piece pointing off the grid |
| Tango *(provisional)* | array lengths; `links` pairs orthogonally adjacent, not shared between two pairs, and each sum within the range two values can take; three shaded cells per row and per column |

The alternative to a namespaced `board` — a distinct top-level key per type,
`queensBoard` / `tangoBoard` / `tracksBoard` — is rejected because it makes the top
level unbounded and the app's union noisier for no benefit; the sibling `type`
already discriminates.

### The `size` question, and what it costs

Moving `size` out of the envelope and into `board` is the right call and it is
**not free**. It rewrites all 32 committed archive files, because `size` is
currently top level.

What is preserved: generation stays reproducible from a seed, and `tools.verify`
still replays every puzzle. The re-nesting is mechanical and has no semantic
content, so the byte-stability guarantee that matters — same seed, same puzzle —
is untouched. What changes is that "the archive regenerates byte-for-byte" is
true *from* the migration onward and false across the boundary. That should be
its own commit, reviewable on its own.

Keeping `size` in the envelope instead would avoid the migration, at the cost of
a top-level field that means "grid is size x size" for one game and "grid is
size wide" for another. That is precisely the ambiguity that produced the
`region_count` bug. I would rather pay the migration.

### `generatorVersion` must *not* be bumped for this

An earlier draft of this document proposed bumping `generatorVersion` 2 -> 3
along with the migration. That is wrong, and wrong in a way that would have gone
unnoticed.

`generator_version` records **which generation algorithm produced the puzzle**,
not how the file is serialised. `generator.py` sets it per code path: 1 on the
Queens path, 2 on the Star Battle path, and the docstring at `generator.py:18`
says exactly that. Re-nesting JSON fields changes no algorithm, so a migrated
Queens file is still version 1 and a migrated Star Battle file is still version
2. Relabelling them 3 would assert a third generation path that does not exist,
and would leave Queens at 1 and Star Battle at 3 — an archive that claims two
different things about two files produced by unchanged code.

It would also have passed CI, silently, because `verify_replay` compares the
regenerated `board` and, when present, the `difficulty` — and **never** compares
`generator_version` (`generator.py:186-194`). Nothing in the pipeline would notice
a wrong label.

So the migration needs no version bump. If the *format* ever needs one — a
migration is exactly the moment that becomes arguable — it gets its own
`formatVersion` field, separate from the algorithm that produced the puzzle. And
closing the `verify_replay` gap is worth doing on its own, independent of any
migration: a field that is supposed to identify a generator and is checked by
nothing is not a fact anyone can rely on.

### The `id` suffix

`id` currently permits only an optional `-star`, and three sites hardcode the
two-type assumption: `HomePage.tsx:97` (`familyOf` returns `'queens' |
'star-battle'`), `stats.ts:22` and `share.ts:40` (both written as literal
`'queens' | 'star-battle'` unions). The suffix becomes a per-type slug from one
table, and `familyOf` falls back to reading `type` out of the file rather than
guessing from the filename.

## 6. The daily model

Two games a day is already a decision, and a third makes it three. That is a
product question, not a refactor question, but the ramp has to change shape
regardless:

- `generate_ramped` hardcodes Queens, and `WEEKLY_RAMP` is one target per
  weekday. A third game needs a **per-type policy**, not a second ramp table
  copy-pasted: `gated` (walk the seed until logic-only), `companion` (unique
  solution, no band, no gate — today's Star Battle), or `ramped` (aim at a
  target, record the achieved band).
- Star Battle is already `companion`. Tango would most likely be `ramped` and
  Train Tracks most likely `companion` on current evidence, since a basic rule
  set for it is weak.

## 7. Silent-failure hazards

These will not throw when a third type appears. They will just quietly exclude
it, which is the failure mode worth hunting for by hand in review:

| Site | What happens with a new type |
| --- | --- |
| `dates.ts:52` `puzzleIdsForDay` | **the chokepoint.** Returns a hardcoded `[day, day + "-star"]`, and it is the *only* source of candidate ids for both the home page (`HomePage.tsx:36`) and the archive (`puzzles.ts:120`). A third puzzle published correctly is invisible on both pages, because nothing ever asks for it. **Fixed** — enumerates `PUZZLE_TYPES`. |
| `dates.ts:35` `isStarPuzzleId` | the `-star` test behind the id helpers; a new suffix is not recognised. **Fixed** — renamed `isCompanionPuzzleId`, decided by suffix rather than by spelling. |
| `HomePage.tsx:97` `familyOf` | infers the type from the id when a file 404s, so a new suffix falls back to Queens and renders under the wrong heading. **Fixed** — reads `puzzleTypeOf`. |
| `stats.ts:22`, `share.ts:40` | literal `'queens' \| 'star-battle'` unions — new type rejected by the guard as malformed. **Fixed** — both use `PuzzleType`. |
| `PuzzleView.tsx:92-93` | `hintsAvailable` and the piece noun both branch on `'queens'`, so a new family is announced as a star and offered a hint button that returns nothing. Not in the original list. **Fixed** — read `PUZZLE_TYPE_HAS_HINTS` and `PUZZLE_PIECE`. |
| `InteractiveBoard.tsx:94` | the board's accessible name branches on `'queens'`, so a new family is announced as "star battle". Not in the original list. **Fixed** — the label, lowercased. |
| `stats.ts:208-209` | per-type tallies written out by hand, so a new type has no bucket. **Fixed** — `byType` iterates the registry. |
| `schema` `id` pattern | a new file fails validation outright (this one is loud, which is fine). **Loud by construction** — the suffix list is generated from `conformance/id-cases/` by `tools/schema_ids`, so it rejects a family the parsers do not know rather than accepting anything suffixed. CI runs `--check`. |
| `verify_replay` | compares `board` and `difficulty`, never `generator_version` — a mislabelled version passes CI. **Fixed** in two parts: the version is compared, and the config is rebuilt by the type's own rulebook (`replay_config`) rather than by `is PuzzleType.STAR_BATTLE` inside the replay path. The second part is what stops a third family's file from replaying at the wrong shape. |
| `hints.ts:358` | already returns `null` — correct by default, listed so it is not "fixed" by accident |

The first row is the one to fix first, and it changes the order of the work.
Repairing `familyOf` alone is necessary and nowhere near sufficient: `familyOf`
is only reached for a day whose probe 404'd, so it decides how a *missing* file
is labelled, while `puzzleIdsForDay` decides whether a *present* file is ever
fetched at all. Daily id generation moves into the suffix/type registry first,
and `familyOf` becomes a consequence of it rather than an independent fix.

The rule that follows from the rest: any new `PuzzleType` must be a compile
error somewhere. `PUZZLE_TYPE_LABEL` and `PUZZLE_PIECE` are
`Record<PuzzleType, …>`, so they will be — that pattern is the one to copy, not
the literal unions to fix afterwards.

## 8. What this costs, roughly

Free, because it already generalises: the pipeline, the shared schema mechanism,
the conformance suite, the archive tooling, `PUZZLE_TYPE_LABEL` / `PUZZLE_PIECE`,
the per-type stats buckets in spirit, the exact-solver discipline.

Real work:

1. `Grid` contract in both languages, plus `width`/`height` on each `Board`.
   Small, and it should be its own commit so the 48/48 trace baseline is
   re-verified in isolation.
2. `Puzzle` as a union, `parse_puzzle` dispatching, schema per-type `board`
   shapes for everything dimension-independent, the relational length and clue
   checks in both parsers, and the id suffix table. Mirrored in
   `app/src/domain/`, with the schema/parser split pinned by conformance.
3. The suffix/type registry extended to `puzzleIdsForDay`, so a third game is
   enumerated on the home page and the archive at all. This is the item that
   makes a published third game visible, and it has to land with step 2 rather
   than after it. **Landed** — `PUZZLE_TYPE_SUFFIX` in the app, with
   `conformance/id-cases/` pinning the app's id naming to the engine's.
4. Archive migration: 32 files re-nested, `generatorVersion` left at 1 and 2,
   verify green.
5. `verify_replay` compares `generator_version` as well, closing the gap that
   would otherwise let a mislabelled archive pass CI forever. Independent of the
   migration and worth doing first.
6. Per-type rulebook registry in the engine; `ramp.py` and the three tools
   dispatch through it. The last two per-type branches outside it are now
   resolved: `verify_replay` asks the rulebook for the config that rebuilds a
   file. The branches left in `generator.py` are the placement algorithms
   themselves, which is where per-type generation genuinely belongs, and
   `puzzle.py`'s `regionCapacity` key is a statement about the file format, so
   it moves with step 4 rather than ahead of it.
7. `GameState` as a union in the app, plus the registry, plus a cell renderer and
   input handler per game.
8. Fix the remaining silent-failure sites in §7. **Done** for the app-side id
   and type-list sites; the `schema` `id` pattern still rejects a new suffix
   loudly, which is correct until step 2.

Step 2's "relational checks in both parsers" is now covered from both sides.
`board-cases/` pins the rules the schema cannot express, and `schema-cases/` pins
which rule a rejection names and what an accepted file parses to. The second
half was missing: the suite asserted only *that* a file was refused, so a parser
rejecting it for an unrelated reason still passed, and an accept case checked
only that `id` round-tripped. Both halves now carry the expectation that makes a
wrong-but-passing implementation fail.

Making that assertable meant changing what the parsers report. A path alone does
not identify a rule — `required`, `additionalProperties` and a failing `if` all
fire at the document root — so both parsers now name the schema keyword and the
property it objected to. That put a real divergence on the table: ajv reports a
failed `if` as a wrapper error naming `then`, and jsonschema reports only the
inner failure. The wrapper is dropped on both sides, which is a deliberate
normalisation rather than an oversight; the two errors agree on everything else.

Steps 1–6 are the *precondition* for a third game, and none of them produce a
playable puzzle. They are worth doing as their own PR, on their own merits, before
anyone writes a Tango rule.

## 9. Open decisions

1. **Verify Tango first.** Every Tango row above is from memory. Before any of
   this is built for Tango, its rules should be pulled from real instances and
   solved to verified-uniqueness, the way Train Tracks was.
2. **Accept the archive migration?** Recommended, for the reason in §5.
3. **Square-only Train Tracks?** If we ship it square, `Grid` gains nothing
   Train Tracks uses, and step 1 shrinks. Keeping the door open for non-square is
   cheap *now* and expensive later.
4. **Three puzzles a day, or a rotation?** Cheapest to decide before step 4.
5. **Name.** "Tango" is LinkedIn's product name for their branded puzzle. We ship
   generic genre names, and we should not adopt theirs.
