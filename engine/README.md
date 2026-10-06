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
the seed upward until one appears (see the M4 section in the root [README](../README.md)).
The difficulty line it prints — band, weighted score, and whether the solve needed a
hypothesis — is the soft signal the product uses to pick a daily mix.

## Publishing and verifying the archive

`tools/publish.py` and `tools/verify.py` are the daily pipeline (M8 in the root
[README](../README.md)). `publish` fills the archive with the same deterministic recipe as
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
layout repeats one from the previous two weeks — the generator is stars-first,
so two unrelated seeds can land on the same arrangement, and back-to-back days
that shared one would be playable from memory.

```sh
python -m tools.generate --date 2026-10-04 --type star-battle            # 9x9, 2 stars
python -m tools.generate --date 2026-10-05 --type star-battle --size 8   # override a size
```

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
