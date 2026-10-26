# queens-engine

Puzzle generation, validation and difficulty scoring. See the [root README](../README.md)
for the architecture and commands.

The package `queens_engine` is pure Python with no web dependencies. Everything under
`tools/` is a thin CLI on top of it.

## Checking Sudoku lessons

The 15 Learn exercises use original committed boards, three per technique.
From this directory, recheck their unique solutions, prepared candidates and
teaching patterns:

```sh
uv run python -m tools.sudoku_lessons
```

Use `--write-report` to refresh the offline certificates after a deliberate lesson
change. It validates the entire catalog before writing. Neither command searches
for new boards. Exercise descriptors and givens share one catalog with the app.
Answers remain in the review report and outside the app imports.

## Checking Star Battle lessons

The frozen catalog contains twelve prepared positions, three per technique. From
this directory, verify exact unique solutions, the displayed stars and crosses,
first forced moves, source hashes and independent remaining-capacity witnesses:

```sh
.venv/bin/python -m tools.star_battle_lessons
.venv/bin/pytest -q tests/test_star_battle_lessons.py tests/test_sudoku_lessons.py
```

The command reads only the fixed corpus and referenced baseline positions. It does
not search for examples or regenerate the hint baseline. `--write-report` writes
`docs/measurements/star-battle-lessons.json` after the whole catalog passes. The
runtime catalog contains only one target move per exercise. Full solutions belong
to the review report and are never imported by the app.

## Checking advanced Trio lessons

The frozen course contains twelve positions from distinct published Trio boards,
four per technique. Recheck their unique solutions, prepared candidate notes,
complete accepted-answer sets and short rule witnesses:

```sh
uv run python -m tools.trio_lessons
uv run pytest -q tests/test_trio_lessons.py
```

The checker rejects single-rule shortcuts and unnecessary reasoning steps. The
final technique must leave two candidates after the full final rule applies.
Verification checks only the fixed course. It does not search for new examples.
`--write-report` refreshes the review certificate only after every exercise passes.
Complete solutions stay in the report and outside runtime imports.

## Generating a puzzle

`tools/generate.py` produces a unique-solution puzzle and prints its ASCII render (the
given solution marked with `Q`). The seed defaults to a stable hash of the date, so the
same command always writes the same file:

```sh
python -m tools.generate --date 2026-10-01            # render only
python -m tools.generate --date 2026-10-01 --out ..   # also write <date>.json
python -m tools.generate --date 2026-10-01 --size 6 --seed 42
```

A fixed `--seed` overrides the date hash; the seed is stored in the file and
`verify_replay()` regenerates the board to confirm it. Sizes 5–9 are supported (default 8);
budget exhaustion surfaces as `GenerationError` instead of a puzzle with a second solution.

`--logic-only` accepts only boards the deduction engine can solve without guessing, bumping
the seed upward until one appears (see [the deduction engine](../docs/engine.md#the-deduction-engine)).
The difficulty line it prints — band, weighted score, and whether the solve needed a
hypothesis — is the soft signal the product uses to pick a daily mix.

## Publishing and verifying the archive

`tools/publish.py` and `tools/verify.py` are the daily pipeline (see
[the daily pipeline](../docs/pipeline.md)). `publish` fills the archive with the same
deterministic recipe as
`generate --logic-only` but *scans for gaps*: it publishes from the first missing date or
the latest committed one — whichever is later — through today plus a `--lead` (default 3).
It is idempotent, so the cron can run every day and re-runs are no-ops. `verify`
re-parses every committed puzzle and replays it from its seed, which is exactly what CI
runs over `../app/public/puzzles/` on every push.

```sh
python -m tools.publish --out ../app/public/puzzles     # idempotent, deterministic
python -m tools.publish --dry-run --lead 7              # preview without writing
python -m tools.verify --dir ../app/public/puzzles      # exit 1 on any mismatch
```

## Star Battle

The generator emits both puzzle types. Queens (one star per row, column and
region) is `generatorVersion` 1 — the frozen stream the committed puzzles were
built with. Star Battle (k stars per row, column and region, still `size`
regions, still no two stars touching) is `generatorVersion` 2 and a separate
placement function, so the version-1 boards replay byte-for-byte.

The solver, the board model, the schema and the parsers were already
capacity-aware; the generator was the last Queens-only piece. Region growth is
the only stage that changed shape: instead of one queen per region, each region
seeds from its k stars (bucketed in row-major order) and floods from there, and a
layout that leaves a region disconnected is rejected like any other invalid
board.

Two facts the star path depends on, both worth knowing before extending it:

- **Not every size admits a star count.** Two non-touching stars per row need a
  row span of 3 columns and each row shadows its neighbour's, so within the
  generator's 5..9 range only 8x8 and 9x9 admit two stars per row; three stars
  need at least 12x12. `FEASIBLE_STAR_BATTLE` in `generator.py` records the
  brute-forced result and `generate_puzzle` fails fast on anything else instead
  of burning its attempt budget on an impossible board.
- **Uniqueness is the only fairness guarantee here.** `deduce` (and therefore
  `--logic-only` and `score_difficulty`) still refuses non-Queens boards, so
  Star Battle files are unique-solution but neither logic-scored nor
  logic-gated. `tools/generate.py --type star-battle` says so out loud. The app
  matches: it plays a star file but hides the Hint button, because
  `firstHint` returns `null` rather than reasoning in one star about a board
  that holds two.

Every day carries a star companion: `tools.publish.py` fills it beside the
queens board through the same windowing, and each star file replays from its
seed at the type's pinned 9x9, so there is no content decision to make about
which day is a star day. Publish also refuses a star board whose solution
layout repeats another published within two weeks on either side — the
generator is stars-first, so two unrelated seeds can land on the same
arrangement, and boards close together that shared one would be playable from
memory. `tools.verify` enforces the same window over committed files, so a star
board that reached the archive some other way is rejected at merge time too
(only boards of the current published size are compared; the pre-9x9 archive
predates the rule and can never match it by shape anyway).

```sh
python -m tools.generate --date 2026-10-04 --type star-battle            # 9x9, 2 stars
python -m tools.generate --date 2026-10-05 --type star-battle --size 8   # override a size
```

## Train Tracks

Train Tracks uses `generatorVersion` 3 for new boards. Legacy IDs name 7x7 grids;
named IDs select Small (8x8), Medium (10x10) or Large (12x12). Every row and
column clue is at least 1. Both endpoints are given; extra givens split unknown
sections of the route, with at least one unrevealed cell between given pieces
along the route. The existing clue caps remain.

Version 3 limits each uniqueness check to 10,000 visited search states and each
seed to 1,000,000. An incomplete check may add another eligible clue; exhausting
the seed rejects it for publisher retry. Only fully proven unique boards are
returned. Other solver callers remain exhaustive unless they request a budget.

Versions 1 and 2 retain their original prefix givens and unbounded replay.
Version 1 permits zero clues; version 2 requires every row and column to be used.
Existing archive files, including prepublished puzzles, are not rewritten.

```sh
python -m tools.generate --date 2026-10-13 --type train-tracks   # legacy 7x7
python -m tools.generate --date 2026-10-14-tracks-large --type train-tracks
```

### Benchmarking larger boards

From `engine/`, use the configured Python environment to run:

```sh
python -m tools.benchmark_tracks --out /tmp/tracks-probe.json
python -m tools.benchmark_tracks --sizes 12 --count 20 --start-seed 100 --timeout 10
```

The default probe tests seeds 0–99 at 8x8, 10x10 and 12x12 in separate workers,
with ten seconds per worker including independent validation. Generation timings
exclude validation and startup. JSON reports retain failed and timed-out seeds
in the denominator and preserve completed results on interruption. The command
exits nonzero if any size completes fewer than 95% of seeds or any returned board
fails validation. See [measured results](../docs/journal.md#scattered-train-tracks-givens-and-larger-board-proof).
Daily publishing switches to all three named variants on October 14, 2026.
The shared ID manifest pins this date; existing legacy files remain unchanged.

## English Word Paths

The Wend-inspired version-2 constructor lives in `word_paths_gen_v2.py`, using
frozen version-1 candidates from `word_paths_gen.py`. Daily slots start on
**2026-10-15**, as defined in `conformance/id-cases/manifest.json` and read by both
engine and app. Its 5×5 board has lengths 3, 4, 5, 6, eighteen letters and seven
blocked cells. Every letter is used once, with orthogonal paths and no overlap.
Locally valid words can lead to dead ends. Submission order and palindrome
reversal do not multiply solutions; other distinct paths do.

New boards accept **16,781** words from pinned SCOWL 2020.12.07 level 60, while
answers still come from the familiar 748-word authored pilot pool. Selection,
archive hash, normalized digest and full licenses are recorded in
[`data/word-paths-vocabulary.md`](src/queens_engine/data/word-paths-vocabulary.md).
No AI service or runtime dictionary download is required. Uniqueness means one
complete cover against the board’s entire versioned vocabulary, not all English.

Version 2 tries at most fifty frozen-v1 candidates, allows eight extra legal
paths and shares a 500,000-state budget across construction and checking.
Exhaustion fails explicitly and never establishes uniqueness. There is no smaller
vocabulary fallback. The [100-seed report](../docs/measurements/word-paths-vocabulary-v2.json)
records 99 successes independently verified by a separate direct-letter solver
and one bounded failure; all outcomes remain in the denominator. The ordinary
publisher can retry a failed slot using its existing seed-bump policy.

The initial seven answer-free daily files cover October 15–21; later dates use
the usual publisher without backfilling before activation. Ten v2 preview files
use separate seeds and are not published archive files. Original ten v1 golden
files remain unchanged. Reports contain answers for editorial review and must
not go in `app/public/puzzles`. The maintainer has confirmed physical iPhone play.

## Word Paths file versions

The `word-paths` family uses `YYYY-MM-DD-words` IDs. Generate and replay a local
version-2 sample without changing the public archive (commands from `engine/`):

```sh
uv run python -m tools.generate --date 2026-10-15 --type word-paths --out /tmp/word-paths-preview
uv run python -m tools.verify --dir /tmp/word-paths-preview
```

`board` contains only `width`, `height`, `letters` (A–Z or null blockers) and
`wordLengths`. The schema rejects answers, extra fields and difficulty bands.
Parsing checks structure; replay and the exact solver establish content validity.
Marks-only knobs are refused.

`generatorVersion: 1` freezes the original recipe and 748-word list; version 2
freezes the broader list and new rejection policy. Engine and browser choose the
same list from the envelope version, rejecting unknown versions. Original replay
and v1 progress keys are unchanged; v2 attempts use separate keys. After publishing
v2 content, rollback must retain v2-capable readers and both frozen lists.

## The rules are a public interface

Since M6, [`deduce.py`](src/queens_engine/deduce.py)'s pure rule passes (singles,
intersections, subsets) are replayed by the TypeScript app as its live hint engine.
`first_forced_move(board, queens, marks)` is the engine's public half of that contract:
the first move the rules force from a player state, in the exact rule order the app
mirrors. The two implementations must stay byte-identical in firing order, so
`tests/test_conformance_hints.py` asserts the shared `../conformance/hint-cases/`
fixtures — exactly the same expectations the app runs as its `hintConformance.test.ts`.

## Running a script

`pytest` works out of the box because `pyproject.toml` sets `pythonpath = ["src"]`. Plain
scripts do not, and the editable install is not a reliable substitute: if the venv carries
the macOS `hidden` file flag — `chflags` will show it, and some privacy tooling sets it
recursively — then Python 3.13 skips every `.pth` file in `site-packages`, so
`import queens_engine` fails while `uv sync` still reports the package as installed. Each
script under `tools/` therefore bootstraps its own path:

```sh
python -m tools.generate --date 2026-09-30
```

If imports fail unexpectedly, check the flags before reaching for `uv sync`:

```sh
ls -lO .venv/lib/python3.13/site-packages/*.pth
chflags -R nohidden .venv          # only if the flag is not deliberate
```

## Trio prototype (not published)

Trio is a 9×9 sun/moon/star variant: three of each symbol in every row and column,
no three identical consecutive symbols, and adjacent same/different clues. The
prototype has direct deductions and a separate exact line-pattern solver. It is
not registered with the daily publisher or browser app yet.

From `engine/`:

```sh
uv run python -m tools.trio_probe --count 20 --out /tmp/trio-pilot.json
uv run pytest -q tests/test_trio.py tests/test_trio_gen.py
```

The probe writes review data including answers and deduction traces, never public
puzzle files. Its provisional recipe requires deduction completion and a unique
solution. See the [design](../docs/superpowers/specs/2026-10-18-trio-design.md) and
[measured pilot](../docs/measurements/trio-pilot.json). Human difficulty is untested.

## Sudoku preview certificates

From `engine/`, `uv run python -m tools.sudoku_preview` verifies the three
committed boards without writing. Add `--generate` to reconstruct the batch:
at most 256 seeds per level, with a 200,000-node limit per independent exact
check. Exhaustion never proves uniqueness. Broad construction is a manual probe;
CI checks the three fixed boards and one small deterministic recipe.

Easy uses singles and peer elimination. Medium adds locked candidates and pairs;
Hard adds triples and X-wing. A band requires logical completion and, above Easy,
a stall under the preceding band. These describe supported techniques, not human
solve times. The [measurement report](../docs/measurements/sudoku-preview.json)
contains offline answers and traces; app definitions contain only givens and IDs.
Sudoku publishes three daily levels through its registered rulebook.

## Nurikabe rules and daily generation

`nurikabe.py` provides immutable `NurikabeGrid(size, clues)`, complete-board
validation, and bounded exact counting. Sizes 2 through 10 are accepted. Clues
are row-major integers, with zero for an unnumbered cell. Solutions contain
`SEA = 0` and `LAND = 1` for every cell. Unknown marks are not complete answers.

Each orthogonally connected land island contains exactly one clue and has that
many cells. Numbered cells are land. Islands may touch diagonally, but cannot
share an edge. The sea is nonempty and orthogonally connected, without any
all-sea 2×2 square. These are the [standard Nurikabe rules](https://www.nikoli.co.jp/en/puzzles/nurikabe/).

`solve` returns zero, one, or two distinct answers. One means proven unique.
Its default 200,000-node budget covers root entry, every connected-island growth
attempt including revisits, and each candidate compatibility inspection.
`NurikabeSearchLimitError` means inconclusive, even after one answer is found.
A zero budget always raises. Large islands may exhaust the budget before
combination search starts. The size cap does not guarantee completion.

This original 5×5 example has one answer. Run it with the engine environment
and `PYTHONPATH=src`:

```python
from queens_engine.nurikabe import NurikabeGrid, solve

rows = ((1, 0, 0, 2, 0), (0, 1, 0, 0, 0), (0, 0, 0, 1, 0), (2, 0, 0, 0, 0), (0, 0, 0, 2, 0))
result = solve(NurikabeGrid(5, tuple(value for row in rows for value in row)))
assert len(result.solutions) == 1
```

Run `uv run pytest -q tests/test_nurikabe.py` for the independent tiny-board
oracle and rule checks. The playable preview has three original boards, one 5×5
and two 7×7. `uv run python -m tools.nurikabe_preview` verifies the actual app
catalog and its offline certificate; `--write-report` refreshes the certificate
only after all boards prove unique. Browser data contains clues only. There is
no logical-difficulty rating or hint system.

`nurikabe_gen.py` freezes the daily version-1 recipe. It constructs original 7×7
land and sea geometry, puts one numbered clue in each island, then requires
exhaustive uniqueness within the exact budget. Construction and aggregate exact
work are bounded. Exhausted or ambiguous candidates are rejected. Island-size
filters limit singleton-heavy boards; they do not establish human difficulty.

The registered `NurikabeRulebook` publishes one `YYYY-MM-DD-nurikabe` file per day
from October 12, 2026. Files contain clues, seed and generator version, without
answers or a difficulty field. The publisher rejects a repeated solution layout
within 14 days, including rotations and reflections. Generation itself depends
only on its recorded seed, so archive replay stays independent of file history.

Run `uv run python -m tools.nurikabe_launch` to recheck all 18 initial files for
October 12–29. The offline certificate records exact uniqueness, complete-board
validation, replay and distinct clue and solution layouts under all eight square
symmetries. None repeats an original preview. Required tests use a frozen
generation seed and bounded-failure cases, without a large seed sweep.
