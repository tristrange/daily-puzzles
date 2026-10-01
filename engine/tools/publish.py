"""Generate the missing daily puzzles and keep the archive published.

Usage:
    python -m tools.publish [--out DIR] [--lead 3] [--start YYYY-MM-DD] [--dry-run]

Each day carries two puzzles: the Queens board named after the day, and its
Star Battle companion named `<date>-star.json`. The suffix is part of the
puzzle's identity rather than only its filename, because a solve is recorded
against an id and first-solve-wins would otherwise let one of the day's two
puzzles block the other.

Scans DIR for committed puzzle files and fills the gaps from the first missing
day through (today + `--lead` days), using the same deterministic recipe as
`tools.generate`: a seed hashed from the id, size 8. Queens walks the seed
upward until the board needs no guessing. Star Battle cannot — the deduction
engine is Queens-only and refuses a star board outright — so it takes the
guarantee the generator actually provides, a unique solution. Idempotent:
existing files are never rewritten and a given id always maps to one puzzle, so
it is safe to run from cron every day and to run again by hand.
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
    PuzzleType,
    deduce,
    dumps_puzzle,
    generate_puzzle,
    score_difficulty,
)

#: Default size for daily puzzles, mirroring `tools.generate`.
PUZZLE_SIZE = 8

#: How many days ahead of "today" the archive should stay published.
DEFAULT_LEAD_DAYS = 3

#: Stars per row on the Star Battle companion.
STARS_PER_ROW = 2

STAR_SUFFIX = "-star"

DATE_FILE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})(\-star)?\.json$")


def _existing_ids(out_dir: Path) -> set[str]:
    """Every puzzle id already committed, e.g. `2026-10-01` and `2026-10-01-star`."""
    existing: set[str] = set()
    for path in out_dir.glob("*.json"):
        match = DATE_FILE.match(path.name)
        if match is None:
            continue
        try:
            day = date(int(match.group(1)), int(match.group(2)), int(match.group(3)))
        except ValueError:
            continue
        existing.add(day.isoformat() + (match.group(4) or ""))
    return existing


def _existing_days(out_dir: Path) -> set[date]:
    """Every calendar day that has at least one puzzle committed."""
    ids = _existing_ids(out_dir)
    return {date.fromisoformat(puzzle_id.rstrip(STAR_SUFFIX)) for puzzle_id in ids}


def _generate_queens(puzzle_id: str, seed: int) -> tuple[Puzzle, float]:
    """Generate a logic-only Queens puzzle, bumping the seed on any failure.

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


def _generate_star(puzzle_id: str, seed: int) -> Puzzle:
    """Generate a Star Battle companion, bumping the seed on any failure.

    The generator already guarantees a unique solution, which is the promise a
    star board can keep: unlike Queens it cannot also promise that no guessing is
    needed, because `deduce` refuses a star board rather than scoring it.
    Raises `RuntimeError` if the seed budget runs out.
    """
    for _bump in range(LOGIC_ONLY_TRIES):
        try:
            return generate_puzzle(
                seed=seed,
                puzzle_id=puzzle_id,
                config=GenerationConfig(
                    size=PUZZLE_SIZE,
                    puzzle_type=PuzzleType.STAR_BATTLE,
                    stars_per_row=STARS_PER_ROW,
                ),
            )
        except GenerationError:
            seed = (seed + 1) % (2**32)
    raise RuntimeError(f"{puzzle_id}: no star board in {LOGIC_ONLY_TRIES} seed bumps")


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
    existing = _existing_ids(args.out)
    days = _existing_days(args.out)
    today = date.today()

    if args.start is not None:
        start = date.fromisoformat(args.start)
    elif days:
        start = max(days) + timedelta(days=1)
    else:
        start = today
    end = today + timedelta(days=args.lead)

    window = start
    while window <= end:
        for puzzle_id, generate in (
            (window.isoformat(), _generate_queens),
            (f"{window.isoformat()}{STAR_SUFFIX}", _generate_star),
        ):
            if puzzle_id in existing:
                print(f"skip   {puzzle_id} (already published)")
                continue
            print(f"publish {puzzle_id}" + (" (dry run)" if args.dry_run else ""))
            if args.dry_run:
                continue
            seed = seed_from_date(puzzle_id)
            try:
                generated = generate(puzzle_id, seed)
            except RuntimeError as error:
                print(f"error: {error}", file=sys.stderr)
                return 1
            puzzle, score = generated if isinstance(generated, tuple) else (generated, None)
            (args.out / f"{puzzle_id}.json").write_text(dumps_puzzle(puzzle), encoding="utf-8")
            # A star board is unique but not logic-gated and not scored, so it has
            # no difficulty to report. Saying "not rated" beats printing a number
            # that means something weaker than the same number on a Queens board.
            print(
                f"  seed {puzzle.seed}"
                + (f" score {score:g}" if score is not None else " (unique, not logic-gated)")
            )
        window += timedelta(days=1)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
