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

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from queens_engine import (
    LEVEL_NAMES,
    Puzzle,
    PuzzleParseError,
    load_puzzle,
    target_for,
    verify_replay,
)

DATE_FILE = re.compile(r"^(\d{4}-\d{2}-\d{2})(-star)?\.json$")
STAR_SUFFIX = "-star"


def _ramp_note(day_text: str, is_star: bool, puzzle: Puzzle) -> str:
    """Check a Queens file against the ramp for its weekday, if it records a band.

    Only files that carry a `difficulty` are judged. Everything published before
    the ramp existed has none, and their 8x8 size is historical rather than a
    claim, so the archive is left alone. Star Battle is skipped too: it is not on
    the ramp until the deduction engine can rate a star board.
    """
    if is_star or puzzle.difficulty is None:
        return ""
    target = target_for(date.fromisoformat(day_text))
    band = LEVEL_NAMES[puzzle.difficulty - 1]
    if puzzle.size != target.size:
        return f", RAMP MISMATCH (expected {target.size}x{target.size})"
    if puzzle.difficulty > target.level:
        return f", RAMP MISMATCH ({band} is above {target.level_name})"
    # Falling short of the target band is legal: the search reports it and
    # publishes the hardest board it found.
    return f", ramp {band} (target {target.level_name})"


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
            ramp = _ramp_note(match.group(1), match.group(2) == STAR_SUFFIX, puzzle)
        except (PuzzleParseError, ValueError) as error:
            failed.append(f"{path}: {error}")
            continue
        label = f"{path.name}: ok ({puzzle.board.size}x{puzzle.board.size}"
        label += f", seed {puzzle.seed}, replay {'match' if replay else 'MISMATCH'}"
        label += ramp
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
