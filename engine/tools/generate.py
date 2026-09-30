"""Generate a unique-solution daily puzzle and write it to a file.

Usage:
    python -m tools.generate --date 2026-10-01 [--size 8] [--seed N] [--out DIR]
                                [--logic-only]

The seed defaults to a stable value derived from the date, so the same command
always produces the same puzzle. `--logic-only` accepts only boards the
deduction engine can solve without guessing, walking the seed upward until it
finds one (or gives up). See ../README.md for the venv hidden-flag note that
motivates the explicit sys.path bootstrap here.
"""

from __future__ import annotations

import argparse
import hashlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from queens_engine import (
    GenerationConfig,
    GenerationError,
    deduce,
    dumps_puzzle,
    generate_puzzle,
    render_puzzle,
    score_difficulty,
)

#: How many seed bumps `--logic-only` may try before failing loudly.
LOGIC_ONLY_TRIES = 32


def seed_from_date(date: str) -> int:
    """Deterministic seed for a puzzle id, shared by every publishing tool."""
    digest = hashlib.sha256(date.encode("utf-8")).digest()
    return int.from_bytes(digest[:4], "big")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="tools.generate")
    parser.add_argument("--date", required=True, help="puzzle id in YYYY-MM-DD")
    parser.add_argument("--size", type=int, default=8)
    parser.add_argument("--seed", type=int, help="defaults to a hash of --date")
    parser.add_argument("--out", type=Path, help="directory to write the puzzle into")
    parser.add_argument(
        "--logic-only",
        action="store_true",
        help="keep bumping the seed until the board needs no guessing",
    )
    args = parser.parse_args(argv)

    base = args.seed if args.seed is not None else seed_from_date(args.date)
    seed = base
    for _attempt in range(LOGIC_ONLY_TRIES if args.logic_only else 1):
        try:
            puzzle = generate_puzzle(
                seed=seed,
                puzzle_id=args.date,
                config=GenerationConfig(size=args.size),
            )
        except GenerationError as error:
            print(f"generation failed: {error}", file=sys.stderr)
            return 1
        if not args.logic_only or deduce(puzzle.board, allow_guesses=False).solved:
            break
        seed = (seed + 1) % (2**32)
    else:
        print(
            f"no board for {args.date} solved without guessing in "
            f"{LOGIC_ONLY_TRIES} seed increments",
            file=sys.stderr,
        )
        return 1

    difficulty = score_difficulty(puzzle.board)
    status = "logic" if difficulty.needs_guessing else "pure-logic"
    print(f"difficulty: {difficulty.level_name} (score {difficulty.score:g}, {status})")

    if args.out is not None:
        args.out.mkdir(parents=True, exist_ok=True)
        target = args.out / f"{args.date}.json"
        target.write_text(dumps_puzzle(puzzle), encoding="utf-8")
        print(f"wrote {target}")
    print(render_puzzle(puzzle))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
