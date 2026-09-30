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
