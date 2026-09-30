"""Generate the missing daily puzzles and keep the archive published.

Usage:
    python -m tools.publish [--out DIR] [--lead 3] [--start YYYY-MM-DD] [--dry-run]

Scans DIR for committed `<date>.json` files and fills the gaps from the first
missing day through (today + `--lead` days), using the same deterministic
recipe as `tools.generate`: a seed hashed from the date, size 8, and a
logic-only walk upward until the board needs no guessing. Idempotent —
existing files are never rewritten, and a given date always maps to one puzzle
— so it is safe to run from cron every day and to run again by hand.
"""

from __future__ import annotations

import argparse
import re
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from tools.generate import LOGIC_ONLY_TRIES, seed_from_date

from queens_engine import (
    GenerationConfig,
    GenerationError,
    Puzzle,
    deduce,
    dumps_puzzle,
    generate_puzzle,
    score_difficulty,
)

#: Default size for daily puzzles, mirroring `tools.generate`.
PUZZLE_SIZE = 8

#: How many days ahead of "today" the archive should stay published.
DEFAULT_LEAD_DAYS = 3

DATE_FILE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})\.json$")


def _existing_dates(out_dir: Path) -> set[date]:
    existing: set[date] = set()
    for path in out_dir.glob("*.json"):
        match = DATE_FILE.match(path.name)
        if match is None:
            continue
        try:
            existing.add(date(int(match.group(1)), int(match.group(2)), int(match.group(3))))
        except ValueError:
            continue
    return existing


def _generate_one(puzzle_id: str, seed: int) -> tuple[Puzzle, float]:
    """Generate a logic-only puzzle, bumping the seed on any failure.

    Returns the parsed puzzle (already schema-valid) and its difficulty score.
    Raises `RuntimeError` if the seed budget runs out.
    """
    for _bump in range(LOGIC_ONLY_TRIES):
        try:
            puzzle = generate_puzzle(
                seed=seed,
                puzzle_id=puzzle_id,
                config=GenerationConfig(size=PUZZLE_SIZE),
            )
        except GenerationError:
            seed = (seed + 1) % (2**32)
            continue
        if deduce(puzzle.board, allow_guesses=False).solved:
            return puzzle, score_difficulty(puzzle.board).score
        seed = (seed + 1) % (2**32)
    raise RuntimeError(f"{puzzle_id}: no logic-only board in {LOGIC_ONLY_TRIES} seed bumps")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="tools.publish")
    parser.add_argument("--out", type=Path, default=Path("./puzzles"))
    parser.add_argument("--lead", type=int, default=DEFAULT_LEAD_DAYS)
    parser.add_argument(
        "--start", help="first date to fill (default: day after the latest committed)"
    )
    parser.add_argument("--dry-run", action="store_true", help="print what would be published")
    args = parser.parse_args(argv)

    args.out.mkdir(parents=True, exist_ok=True)
    existing = _existing_dates(args.out)
    today = date.today()

    if args.start is not None:
        start = date.fromisoformat(args.start)
    elif existing:
        start = max(existing) + timedelta(days=1)
    else:
        start = today
    end = today + timedelta(days=args.lead)

    window = start
    while window <= end:
        puzzle_id = window.isoformat()
        if window in existing:
            print(f"skip   {puzzle_id} (already published)")
        else:
            print(f"publish {puzzle_id}" + (" (dry run)" if args.dry_run else ""))
            if not args.dry_run:
                seed = seed_from_date(puzzle_id)
                try:
                    puzzle, score = _generate_one(puzzle_id, seed)
                except RuntimeError as error:
                    print(f"error: {error}", file=sys.stderr)
                    return 1
                target = args.out / f"{puzzle_id}.json"
                target.write_text(dumps_puzzle(puzzle), encoding="utf-8")
                print(f"  seed {puzzle.seed} score {score:g}")
        window += timedelta(days=1)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
