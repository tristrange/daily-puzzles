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
| `validate_board` | branches on `PuzzleType.QUEENS` to demand `region_count == size` and all capacities 1 |
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
- The value it buys is speculative. We have one confirmed candidate (Tango) and
  one unverified (Train Tracks). Building a framework to serve a hypothesis is
  how frameworks rot.
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
of addressable cells".

```
width, height, cellCount
index(row, col) -> int
coords(i) -> (row, col)
neighbours(i) -> tuple[int, ...]        # orthogonal
```

`Board` already satisfies this as a square grid; it gains two derived properties
and changes nothing else:

```
@property
def width(self) -> int: return self.size

@property
def height(self) -> int: return self.size
```

Train Tracks gets its own `TrackGrid` implementing the same four members, with
`width != height` permitted. The app's shared grid chrome (layout, cell
addressing, focus order, theme) is written against `Grid`, so it is reused
unchanged. `Board` itself is **not** widened: it keeps square-only, keeps its
regions, and keeps failing a Train Tracks board, because pretending otherwise is
what produced the `region_count` bug in #29.

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

`hints.ts:358` already returns `null` for anything but Queens, which is the
correct default: a new game ships with no hints rather than with wrong ones.

## 5. The file format

The envelope stays uniform and small; everything game-specific moves under one
`board` key whose shape is selected by the sibling `type`.

```jsonc
{
  "id": "2026-11-02", "type": "queens",
  "seed": 1710439114, "generatorVersion": 3, "difficulty": 2,
  "board": { "size": 8, "regions": [ ... ], "regionCapacity": [ ... ] }
}
```

```jsonc
{
  "id": "2026-11-02-tango", "type": "tango",
  "seed": 2748193021, "generatorVersion": 1, "difficulty": 3,
  "board": {
    "size": 6,
    "givens": [1, 0, 0, 3, 6, 0],
    "shaded": [1, 1, 0, 0, 1, 0],
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
    "rowClues": [5, 5, 5, 7, 5, 5, 2],
    "colClues": [2, 4, 2, 6, 3, 4, 6],
    "givens": [0, 0, 5, 0, 0, 0, 0, 0, 0]
  }
}
```

The schema becomes `allOf` over `if type == X then board has shape X`, with
`additionalProperties: false` inside each shape. The alternative — a distinct
top-level key per type, `queensBoard` / `tangoBoard` / `tracksBoard` — is
rejected because it makes the top level unbounded and the app's union noisier for
no benefit; the sibling `type` already discriminates.

### The `size` question, and what it costs

Moving `size` out of the envelope and into `board` is the right call and it is
**not free**. It rewrites all 32 committed archive files, because `size` is
currently top level, and it needs `generatorVersion` 2 → 3.

What is preserved: generation stays reproducible from a seed, and `tools.verify`
still replays every puzzle. The re-nesting is mechanical and has no semantic
content, so the byte-stability guarantee that matters — same seed, same puzzle —
is untouched. What changes is that "the archive regenerates byte-for-byte" is
true from version 3 onward and false across the version 2 → 3 boundary. That is
what `generatorVersion` is for, but it is a visible event and belongs in its own
commit, reviewable on its own.

Keeping `size` in the envelope instead would avoid the migration, at the cost of
a top-level field that means "grid is size x size" for one game and "grid is
size wide" for another. That is precisely the ambiguity that produced the
`region_count` bug. I would rather pay the migration.

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
| `stats.ts:22`, `share.ts:40` | literal `'queens' \| 'star-battle'` unions — new type rejected by the guard as malformed |
| `stats.ts:208-209` | per-type tallies written out by hand, so a new type has no bucket |
| `HomePage.tsx:97` | `familyOf` infers the type from the id; a new suffix is read as Queens |
| `schema` `id` pattern | a new file fails validation outright (this one is loud, which is fine) |
| `hints.ts:358` | already returns `null` — correct by default, listed so it is not "fixed" by accident |

The rule that follows: any new `PuzzleType` must be a compile error somewhere.
`PUZZLE_TYPE_LABEL` and `PUZZLE_PIECE` are `Record<PuzzleType, …>`, so they will
be — that pattern is the one to copy, not the literal unions to fix afterwards.

## 8. What this costs, roughly

Free, because it already generalises: the pipeline, the shared schema mechanism,
the conformance suite, the archive tooling, `PUZZLE_TYPE_LABEL` / `PUZZLE_PIECE`,
the per-type stats buckets in spirit, the exact-solver discipline.

Real work:

1. `Grid` contract + the two properties on `Board`. Small, and it should be its
   own commit so the 48/48 trace baseline is re-verified in isolation.
2. `Puzzle` as a union, `parse_puzzle` dispatching, schema per-type `board`
   shapes, and the `id` suffix table. Mirrored in `app/src/domain/`.
3. Archive migration: 32 files re-nested, `generatorVersion` 2 → 3, verify green.
4. Per-type rulebook registry in the engine; `ramp.py` and the three tools
   dispatch through it.
5. `GameState` as a union in the app, plus the registry, plus a cell renderer and
   input handler per game.
6. Fix the silent-failure sites in §7.

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
