"""Generate a unique-solution daily puzzle and write it to a file.

Usage:
    python -m tools.generate --date 2026-10-01 [--size N] [--seed N] [--out DIR]
                                [--logic-only] [--type TYPE] [--stars K]

The seed defaults to a stable value derived from the date, so the same command
always produces the same puzzle. `--logic-only` accepts only boards the
deduction engine can solve without guessing, walking the seed upward until it
finds one (or gives up).

`--logic-only` and the reported difficulty are the rulebook's call, not this
script's: a type that cannot honour the gate, or is not rated, says so through
`Rulebook.logic_only` / `Rulebook.rated`, and the reason is written down in
`rulebook.py` rather than left as "not implemented yet". See ../README.md for the
venv hidden-flag note that motivates the explicit sys.path bootstrap here.
"""

from __future__ import annotations

import argparse
import hashlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from queens_engine import (
    GenerationError,
    PuzzleType,
    dumps_puzzle,
    render_puzzle,
    rulebook_for,
    rulebooks,
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
    parser.add_argument("--size", type=int, help="board size (default: the type's published size)")
    parser.add_argument("--seed", type=int, help="defaults to a hash of --date")
    parser.add_argument("--out", type=Path, help="directory to write the puzzle into")
    parser.add_argument(
        "--logic-only",
        action="store_true",
        help="keep bumping the seed until the board needs no guessing (queens only)",
    )
    parser.add_argument(
        "--type",
        choices=[book.puzzle_type.value for book in rulebooks()],
        default=PuzzleType.QUEENS.value,
        help="puzzle type to generate",
    )
    parser.add_argument("--stars", type=int, help="stars per row (default: the type's own count)")
    args = parser.parse_args(argv)

    puzzle_type = PuzzleType(args.type)
    book = rulebook_for(puzzle_type)
    if args.logic_only and not book.logic_only:
        print(
            f"--logic-only is not offered for {puzzle_type.value}: the rules do run on a "
            "multi-star board, but 0.1% of generated 8x8 boards finish without guessing, "
            "so the gate would reject essentially all of them",
            file=sys.stderr,
        )
        return 1

    base = args.seed if args.seed is not None else seed_from_date(args.date)
    seed = base
    for _attempt in range(LOGIC_ONLY_TRIES if args.logic_only else 1):
        try:
            puzzle = book.generate(
                seed=seed,
                puzzle_id=args.date,
                size=args.size,
                stars_per_row=args.stars,
            )
        except GenerationError as error:
            print(f"generation failed: {error}", file=sys.stderr)
            return 1
        deduced = book.deduce(puzzle.board, allow_guesses=False)
        if not args.logic_only or (deduced is not None and deduced.solved):
            break
        seed = (seed + 1) % (2**32)
    else:
        print(
            f"no board for {args.date} solved without guessing in "
            f"{LOGIC_ONLY_TRIES} seed increments",
            file=sys.stderr,
        )
        return 1

    if not book.rated:
        print(f"difficulty: not rated ({puzzle_type.value} boards are unique but unscored)")
    else:
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
