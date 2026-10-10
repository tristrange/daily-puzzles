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
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from queens_engine import (
    GenerationError,
    PuzzleType,
    dumps_puzzle,
    puzzle_id,
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


def id_for_day(date_text: str, puzzle_type: PuzzleType) -> str:
    """The puzzle id `--date` names once `--type` has had its say.

    The date names the *day*; the type decides the suffix. Without this, the
    documented `--date 2026-10-04 --type star-battle --out app/public/puzzles`
    wrote a Star Battle board to `2026-10-04.json` — the file the day's Queens
    puzzle owns — and `--out` would have overwritten it.

    A bare `2026-10-04` is the spelling of the unsuffixed type, not a claim about
    which type is wanted, so `--type` decides it. What is contradictory is another
    type's suffix being spelled out next to a different `--type`, and that is
    reported rather than resolved silently in favour of either flag.
    """
    book = rulebook_for(puzzle_type)
    suffix = book.id_suffix
    stem = date_text[: -len(suffix)] if suffix and date_text.endswith(suffix) else date_text
    for other in rulebooks():
        other_suffix = other.id_suffix
        if other_suffix and other_suffix != suffix and stem.endswith(other_suffix):
            raise ValueError(
                f"{date_text} names a {other.puzzle_type.value} puzzle, "
                f"but --type is {puzzle_type.value}"
            )
    day = date.fromisoformat(stem)
    if stem != day.isoformat():
        raise ValueError(f"{date_text} is not a YYYY-MM-DD date")
    return puzzle_id(day, puzzle_type)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="tools.generate")
    parser.add_argument("--date", required=True, help="day in YYYY-MM-DD, or a full puzzle id")
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
    try:
        puzzle_id = id_for_day(args.date, puzzle_type)
    except ValueError as error:
        print(f"error: {error}", file=sys.stderr)
        return 1
    if args.logic_only and not book.logic_only:
        print(
            f"--logic-only is not offered for {puzzle_type.value}: the rules do run on a "
            "multi-star board, but 0.1% of generated 8x8 boards finish without guessing, "
            "so the gate would reject essentially all of them",
            file=sys.stderr,
        )
        return 1

    base = args.seed if args.seed is not None else seed_from_date(puzzle_id)
    seed = base
    for _attempt in range(LOGIC_ONLY_TRIES if args.logic_only else 1):
        try:
            puzzle = book.generate(
                seed=seed,
                puzzle_id=puzzle_id,
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
            f"no board for {puzzle_id} solved without guessing in "
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
        target = args.out / f"{puzzle_id}.json"
        target.write_text(dumps_puzzle(puzzle), encoding="utf-8")
        print(f"wrote {target}")
    print(book.render(puzzle))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
