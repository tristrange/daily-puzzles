"""Pin the app's hint answers against the engine's, over every reachable position.

Usage:
    python -m tools.hint_baseline            # compare against the committed baseline
    python -m tools.hint_baseline --write    # refresh it after a deliberate change

`conformance/hint-cases/` pins a handful of positions exactly. That caught
nothing on #52: the port's intersection rule was unsound for every multi-star
board, and all seven fixtures were single-star, so it shipped and told players
to mark solution cells dead. A fixture list only covers the states someone
thought to write down.

So this is the same sweep as a golden file, over a corpus generated rather than
curated. For each committed puzzle and each prefix of its solution, it walks the
position the way a player does — asking for a hint, applying it, asking again —
and records every step: the marks so far, and the move the engine gives from that
position. The app asserts it produces the same one at every step.

Recording the walk rather than only its end matters. A saturated position, where
every cross is already applied, can only yield a placement or nothing, so the
first version of this recorded 428 positions and not one of them asked for a
cross — a cross being the more common hint a player is given. Walking the whole
path is 1299 positions and 871 of them are crosses.

Positions where the engine has nothing forced are recorded as such, so "no hint"
is pinned too rather than being the untested default.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any, Final, cast

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from queens_engine import Puzzle, iter_solutions, load_puzzle
from queens_engine.deduce import first_forced_move
from queens_engine.puzzle import JsonValue, canonical_dumps

ARCHIVE: Final[Path] = Path(__file__).resolve().parents[2] / "app" / "public" / "puzzles"
BASELINE_PATH: Final[Path] = (
    Path(__file__).resolve().parents[1] / "tests" / "fixtures" / "hint-baseline.json"
)


#: How many hints to follow when walking a position to its end. Bounded so a
#: board whose rules oscillate costs time rather than hanging the tool.
MARK_ROUNDS: Final[int] = 500


def walk(puzzle: Puzzle, queens: list[int]) -> list[tuple[list[int], list[Any] | None]]:
    """Every position the engine walks through from `queens`, and the move at each.

    Each step records the marks so far and the hint from that position, then
    applies the hint to advance. Stopping at a *saturated* position instead would
    be cheaper and much weaker: once every cross is known, the only hint left can
    be a placement or nothing, so the corpus would never ask the app for a cross —
    and a cross is the more common hint a player is given. Recording each step is
    what makes the sweep test that too.

    Built from the public `first_forced_move` rather than the deduction internals,
    so every expectation comes from the same function whose output the app is being
    checked against: one rule, one implementation.
    """
    marks: list[int] = []
    steps: list[tuple[list[int], list[Any] | None]] = []
    for _ in range(MARK_ROUNDS):
        move = first_forced_move(puzzle.board, queens=queens, marks=marks)
        steps.append((list(marks), None if move is None else [move.cell, move.action, move.rule]))
        if move is None or move.action != "x":
            break
        marks.append(move.cell)
    return steps


def build_baseline() -> dict[str, JsonValue]:
    """Every reachable position per committed puzzle, and the move it forces."""
    baseline: dict[str, JsonValue] = {}
    for path in sorted(ARCHIVE.glob("*.json")):
        puzzle = load_puzzle(path)
        solutions = list(iter_solutions(puzzle.board))
        solution = sorted(next(iter(solutions)))
        positions: list[JsonValue] = []
        for placed in range(len(solution) + 1):
            queens = solution[:placed]
            for marks, move in walk(puzzle, queens):
                positions.append([list(queens), list(marks), move])
        baseline[path.stem] = positions
    return baseline


def _describe(value: JsonValue) -> str:
    if value is None:
        return "null"
    return f"a {type(value).__name__}"


def differences(expected: dict[str, JsonValue], actual: dict[str, JsonValue]) -> list[str]:
    """One line per puzzle whose hints moved, naming the positions that changed.

    Reporting the positions rather than dumping both sides keeps a real regression
    readable; the baseline is a wall of arrays and a reviewer needs to know *that*
    the intersection rule stopped firing before they need to see every cell.

    Every expected key is examined and nothing is skipped. A non-list entry is a
    corrupt baseline rather than a matching puzzle, and treating it as a match
    would leave that puzzle unpinned while reporting success — the golden file is
    hand-editable, and `test_trace_baseline` records an earlier version skipping
    exactly that case.
    """
    lines: list[str] = []
    missing = [key for key in expected if key not in actual]
    extra = [key for key in actual if key not in expected]
    lines.extend(f"{key}: absent from the new run" for key in missing)
    lines.extend(f"{key}: not in the baseline" for key in extra)
    for key, want in expected.items():
        if key not in actual:
            continue
        got = actual[key]
        if not isinstance(want, list):
            lines.append(f"{key}: baseline entry is {_describe(want)}, not a list")
            continue
        if not isinstance(got, list):
            lines.append(f"{key}: this run produced {_describe(got)}, not a list")
            continue
        if want == got:
            continue
        changed = [i for i, (a, b) in enumerate(zip(want, got, strict=False)) if a != b]
        if len(want) != len(got):
            lines.append(f"{key}: {len(want)} positions in the baseline, {len(got)} this run")
        else:
            lines.append(f"{key}: positions {changed[:8]} differ")
    return lines


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="tools.hint_baseline")
    parser.add_argument(
        "--write",
        action="store_true",
        help="rewrite the checked-in baseline instead of comparing against it",
    )
    parser.add_argument(
        "--baseline",
        type=Path,
        default=BASELINE_PATH,
        help="baseline to compare against, or to write when --write is given",
    )
    args = parser.parse_args(argv)

    found = build_baseline()
    total = sum(len(cast("list[Any]", v)) for v in found.values())
    if args.write:
        args.baseline.write_text(canonical_dumps(found), encoding="utf-8")
        print(f"wrote {total} positions across {len(found)} puzzles.")
        return 0

    if not args.baseline.exists():
        print(
            f"{args.baseline.name} is missing. Run: python -m tools.hint_baseline --write",
            file=sys.stderr,
        )
        return 1
    # `json.loads` hands back `Any`, and jsonschema-free validation is what this
    # tool is: the file is compared structurally, not parsed into a model.
    loaded: Any = json.loads(args.baseline.read_text(encoding="utf-8"))
    if not isinstance(loaded, dict):
        print(f"{args.baseline} is not a JSON object", file=sys.stderr)
        return 1
    entries = cast("dict[str, Any]", loaded)
    if any(not isinstance(value, list) for value in entries.values()):
        print(f"{args.baseline} is malformed: a puzzle has no positions list", file=sys.stderr)
        return 1

    lines = differences(cast("dict[str, JsonValue]", entries), found)
    if lines:
        print(f"{len(lines)} differences over {len(found)} puzzles:", file=sys.stderr)
        for line in lines[:20]:
            print(f"  {line}", file=sys.stderr)
        print("Run: python -m tools.hint_baseline --write", file=sys.stderr)
        return 1
    print(f"{total} hint positions across {len(found)} puzzles match the baseline.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
