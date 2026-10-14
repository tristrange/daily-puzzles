# queens-engine

Puzzle generation, validation and difficulty scoring. See the [root README](../README.md)
for the architecture and commands.

The package `queens_engine` is pure Python with no web dependencies. Everything under
`tools/` is a thin CLI on top of it.

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

## English word-path pilot

The Wend-inspired constructor lives in `word_paths_gen.py` and is wrapped by
the unpublished Word Paths rulebook. It is **not a fourth published game yet**. Its 5×5 board
has four word lengths (3, 4, 5, 6), 18 letters and seven blocked cells.

```sh
uv run python -m tools.benchmark_word_paths --count 100 --out /tmp/word-paths.json
```

The pilot uses 748 common-word candidates authored with Codex and committed in
`src/queens_engine/data/word-paths-en-v1.txt`. It is frozen for replay, not a complete
English dictionary. No external AI service or runtime download is required.
Uniqueness means exactly one complete cover **against that entire vocabulary**,
not merely against the four words selected by the constructor. Every letter must
be used once, with orthogonal paths, no overlap and each required length once.
Submission order and palindrome reversal do not multiply solutions; other
distinct paths do. Locally valid words may still lead to dead ends.

The constructor rejects boards with more than two other legal vocabulary paths.
This is a content-quality heuristic, not a difficulty rating. Its shared
250,000-state default probe budget covers route construction, word-path enumeration
and cover search, with at most 50 candidates. Exhaustion is inconclusive, never
proof of uniqueness. The CLI rechecks each returned board with fresh unbounded
enumeration and direct rule validation, and reports failures alongside successes.
Exit zero means all requested seeds verified.

Reports include answer paths for editorial inspection; they are not puzzle files
and must not go in `app/public/puzzles`. The [100-seed report](../docs/measurements/word-paths-pilot.json)
and [design](../docs/superpowers/specs/2026-10-14-word-paths-design.md) record what is
proven and what still needs vocabulary review and human playtesting. The file
contract is now implemented; UI and daily rollout remain separate milestones.

## Word Paths version 1 files

The unpublished `word-paths` family uses `YYYY-MM-DD-words` IDs and a 5×5
recipe with lengths 3,4,5,6. Generate and replay a local sample without changing
the public archive (commands from `engine/`):

```sh
uv run python -m tools.generate --date 2026-10-14 --type word-paths --out /tmp/word-paths-preview
uv run python -m tools.verify --dir /tmp/word-paths-preview
```

`board` contains only `width`, `height`, `letters` (A–Z or null blockers) and
`wordLengths`. The schema rejects answers, extra fields and difficulty bands.
Parsing establishes a structurally valid grid; replay and the exact solver
establish content validity. Generation uses 50 attempts and 250,000 work states;
exhaustion fails explicitly, without a fallback. Marks-only knobs are refused.

`generatorVersion: 1` freezes the recipe and the 748-word
[`word-paths-en-v1.txt`](src/queens_engine/data/word-paths-en-v1.txt) list. The app
imports that same source as public reference data. Runtime digest checks and ten
shared golden files protect replay; changing vocabulary or output requires a new
version while retaining the old one. Uniqueness is relative to this finite list.
Human vocabulary review and playtesting are still required before publication.

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
