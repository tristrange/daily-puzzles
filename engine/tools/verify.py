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
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from queens_engine import PuzzleParseError, load_puzzle, verify_replay

DATE_FILE = re.compile(r"^\d{4}-\d{2}-\d{2}\.json$")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="tools.verify")
    parser.add_argument("--dir", type=Path, default=Path("./puzzles"))
    args = parser.parse_args(argv)

    total = 0
    failed: list[str] = []
    for path in sorted(args.dir.glob("*.json")):
        if not DATE_FILE.match(path.name):
            print(f"skip {path.name} (not a date-keyed puzzle file)")
            continue
        total += 1
        try:
            puzzle = load_puzzle(path)
            replay = verify_replay(puzzle)
        except (PuzzleParseError, ValueError) as error:
            failed.append(f"{path}: {error}")
            continue
        label = f"{path.name}: ok ({puzzle.board.size}x{puzzle.board.size}"
        label += f", seed {puzzle.seed}, replay {'match' if replay else 'MISMATCH'})"
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
