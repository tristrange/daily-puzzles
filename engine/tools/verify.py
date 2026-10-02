"""Re-verify every committed puzzle: shape and byte-for-byte replay.

Usage:
    python -m tools.verify [--dir ../app/public/puzzles]

Every published puzzle must still parse against the schema/board rules and must
regenerate byte-for-byte from its own seed (`verify_replay`). This is the daily
pipeline's guard: CI runs it over the committed archive, and the cron job runs
it again on the files it is about to commit, so a generator change cannot drift
the archive silently.
"""

from __future__ import annotations

import argparse
import re
import sys
from datetime import date
from pathlib import Path
from typing import NamedTuple

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from queens_engine import (
    LEVEL_NAMES,
    RAMP_START,
    Puzzle,
    PuzzleParseError,
    load_puzzle,
    target_for,
    verify_replay,
)

DATE_FILE = re.compile(r"^(\d{4}-\d{2}-\d{2})(-star)?\.json$")
STAR_SUFFIX = "-star"


class RampCheck(NamedTuple):
    """What the ramp made of one file.

    A `problem` is a reason to fail verification, kept separate from `note` so a
    broken ramp cannot be reported as a passing file with an odd-looking remark.
    """

    note: str
    problem: str | None = None


def _ramp_check(day_text: str, is_star: bool, puzzle: Puzzle) -> RampCheck:
    """Check a Queens file against the ramp for its weekday.

    Two rules:

    - A Queens file dated on or after `RAMP_START` must carry a band, and that
      band must be within its weekday's target. Anything earlier predates the
      ramp, so its 8x8 size is history and nothing is claimed about it.
    - Star Battle is never checked: it is not on the ramp until the deduction
      engine can rate a star board.

    Falling *short* of the target band is legal — the search reports it and
    publishes the hardest board it found. Falling above it, or a wrong size, is
    not: that is the ramp being broken, and the caller fails the run.
    """
    if is_star:
        return RampCheck("")
    day = date.fromisoformat(day_text)
    target = target_for(day)
    if puzzle.difficulty is None:
        if day < RAMP_START:
            return RampCheck("")
        problem = f"no difficulty recorded; {day} is on or after {RAMP_START}"
        return RampCheck("", problem)
    band = LEVEL_NAMES[puzzle.difficulty - 1]
    if puzzle.size != target.size:
        problem = f"{puzzle.size}x{puzzle.size}, expected {target.size}x{target.size}"
        return RampCheck("", problem)
    if puzzle.difficulty > target.level:
        return RampCheck("", f"{band} is above {target.level_name}")
    return RampCheck(f"ramp {band} (target {target.level_name})")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="tools.verify")
    parser.add_argument("--dir", type=Path, default=Path("./puzzles"))
    args = parser.parse_args(argv)

    total = 0
    failed: list[str] = []
    for path in sorted(args.dir.glob("*.json")):
        match = DATE_FILE.match(path.name)
        if match is None:
            print(f"skip {path.name} (not a date-keyed puzzle file)")
            continue
        total += 1
        try:
            puzzle = load_puzzle(path)
            replay = verify_replay(puzzle)
            ramp = _ramp_check(match.group(1), match.group(2) == STAR_SUFFIX, puzzle)
        except (PuzzleParseError, ValueError) as error:
            failed.append(f"{path}: {error}")
            continue
        if ramp.problem is not None:
            # A board that breaks the ramp is a failed verification, not a note:
            # this is the check that stops the pipeline shipping it.
            problem = f"RAMP MISMATCH ({ramp.problem})"
            failed.append(f"{path}: {problem}")
            print(f"{path.name}: FAILED ({problem})")
            continue
        label = f"{path.name}: ok ({puzzle.board.size}x{puzzle.board.size}"
        label += f", seed {puzzle.seed}, replay {'match' if replay else 'MISMATCH'}"
        if ramp.note:
            label += f", {ramp.note}"
        label += ")"
        print(label)

    if failed:
        print(f"\n{len(failed)} of {total} puzzles FAILED:", file=sys.stderr)
        for line in failed:
            print(f"  {line}", file=sys.stderr)
        return 1
    print(f"\n{total} puzzles verified.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
