"""Pin the deduction engine's observable behaviour on a fixed set of boards.

Usage:
    python -m tools.trace_baseline           # compare against the committed baseline
    python -m tools.trace_baseline --write   # refresh it after a deliberate change

`tools.verify` already proves the committed archive still replays byte-for-byte,
which covers generation and serialisation. It does not cover the *deduction*
engine: a refactor of `board.py` or `deduce.py` that changes which rule fires, in
what order, or how many rounds a board takes still passes every existing test,
because those tests assert properties ("the pure rules never guess") rather than
sequences. A geometry rename looks exactly like a behaviour change from the
outside, and there is nothing to catch it with.

So this pins the whole trace — every rule application, in order, with the round
it happened in — for 48 generated boards, alongside the counters that describe
the outcome. It is a golden file: `--write` is the deliberate, reviewable way to
change it, and the diff is the review.

The board set is `TRACES_SIZES` x `TRACES_SEEDS` of Queens puzzles. Queens only,
because the point is to guard the mark-game geometry that a third game would sit
beside; Star Battle shares that geometry and adds `stars_per_row`, which the
committed archive already replays.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Final, cast

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from queens_engine import (
    DeductionTrace,
    GenerationConfig,
    JsonValue,
    PuzzleType,
    canonical_dumps,
    deduce,
    generate_puzzle,
    score_difficulty,
)

#: Sizes 5..8 x seeds 0..11. Wide enough to cover every rule the engine has and
#: every difficulty band the scorer can award, and small enough that `--write`
#: is a few seconds rather than a coffee break.
TRACES_SIZES: Final[tuple[int, ...]] = (5, 6, 7, 8)
TRACES_SEEDS: Final[tuple[int, ...]] = tuple(range(12))

BASELINE_PATH: Final[Path] = (
    Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "queens-traces.json"
)


def _steps(trace: DeductionTrace) -> list[JsonValue]:
    """A trace's rule applications as JSON rows: rule, round, cell, cells.

    `cell` is null for a step that killed a set of cells rather than claiming
    one, and that distinction is part of what is being pinned.
    """
    return [[step.rule, step.round, step.queen, list(step.cells)] for step in trace.steps]


def build_baseline() -> dict[str, JsonValue]:
    """Generate every traced board and record what the engine did with it."""
    baseline: dict[str, JsonValue] = {}
    for size in TRACES_SIZES:
        for seed in TRACES_SEEDS:
            puzzle = generate_puzzle(
                seed=seed,
                puzzle_id=f"trace-{size}-{seed}",
                config=GenerationConfig(size=size, puzzle_type=PuzzleType.QUEENS),
            )
            full = deduce(puzzle.board)
            pure = deduce(puzzle.board, allow_guesses=False)
            scored = score_difficulty(puzzle.board)
            baseline[f"{size}:{seed}"] = {
                "solved": full.solved,
                "exhausted": full.exhausted,
                "guesses": full.guesses,
                "rounds": full.rounds,
                "level": scored.level,
                "score": scored.score,
                "full": _steps(full),
                "pure": _steps(pure),
            }
    return baseline


def differences(expected: dict[str, JsonValue], actual: dict[str, JsonValue]) -> list[str]:
    """One line per board whose trace moved, naming the fields that changed.

    Reporting the field rather than dumping two traces keeps a real regression
    readable; the baseline is a 40000-character file and a reviewer needs to know
    *that* the subset rule stopped firing before they need to see it.
    """
    lines: list[str] = []
    missing = [key for key in expected if key not in actual]
    extra = [key for key in actual if key not in expected]
    lines.extend(f"{key}: absent from the new run" for key in missing)
    lines.extend(f"{key}: not in the baseline" for key in extra)
    for key, want in expected.items():
        got = actual.get(key)
        if not isinstance(want, dict) or not isinstance(got, dict) or want == got:
            continue
        changed = ", ".join(field for field in want if want.get(field) != got.get(field))
        lines.append(f"{key}: {changed or 'field order only'}")
    return lines


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="tools.trace_baseline")
    parser.add_argument(
        "--write",
        action="store_true",
        help="replace the committed baseline with this run's traces",
    )
    parser.add_argument("--baseline", type=Path, default=BASELINE_PATH)
    args = parser.parse_args(argv)

    actual = build_baseline()
    if args.write:
        args.baseline.parent.mkdir(parents=True, exist_ok=True)
        args.baseline.write_text(canonical_dumps(actual), encoding="utf-8")
        print(f"wrote {len(actual)} traces to {args.baseline}")
        return 0

    if not args.baseline.exists():
        print(f"no baseline at {args.baseline}; run with --write to create it", file=sys.stderr)
        return 1

    # Narrowed from `object` rather than cast: the baseline is a committed file
    # someone can hand-edit, and "is not a JSON object" is a better answer than a
    # TypeError from inside `differences`.
    loaded: object = json.loads(args.baseline.read_text(encoding="utf-8"))
    if not isinstance(loaded, dict):
        print(f"{args.baseline} is not a JSON object", file=sys.stderr)
        return 1
    expected = cast("dict[str, JsonValue]", loaded)

    lines = differences(expected, actual)
    if lines:
        print(f"{len(lines)} of {len(expected)} traces CHANGED:", file=sys.stderr)
        for line in lines:
            print(f"  {line}", file=sys.stderr)
        print(
            "\nIf the change is intended, re-run with --write and review the diff.",
            file=sys.stderr,
        )
        return 1
    print(f"{len(actual)} traces match the baseline.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
