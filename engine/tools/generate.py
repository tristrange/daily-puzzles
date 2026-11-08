"""Generate a unique-solution daily puzzle and write it to a file.

Usage:
    python -m tools.generate --date 2026-10-01 [--size N] [--seed N] [--out DIR]
                                [--logic-only] [--type TYPE] [--stars K]

The seed defaults to a stable value derived from the date, so the same command
always produces the same puzzle. `--logic-only` accepts only boards the
deduction engine can solve without guessing, walking the seed upward until it
finds one (or gives up).

`--logic-only` and the reported difficulty normally come from the rulebook.
Train Tracks and Star Battle also check the app's hint engine on every generated
board, so both require Node and installed app dependencies even without
`--logic-only`.
"""

from __future__ import annotations

import argparse
import hashlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from tools.star_hints import star_hints_solve
from tools.track_hints import tracks_hints_solve

from queens_engine import (
    GenerationError,
    PuzzleType,
    as_marks_board,
    dumps_puzzle,
    puzzle_id,
    rulebook_for,
    rulebooks,
    score_difficulty,
    split_puzzle_id,
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
    parsed = split_puzzle_id(date_text)
    if parsed is None:
        raise ValueError(f"{date_text} is not a YYYY-MM-DD puzzle id")
    day, named_type = parsed
    if date_text == day.isoformat():
        return puzzle_id(day, puzzle_type)
    if named_type is not puzzle_type:
        raise ValueError(
            f"{date_text} names a {named_type.value} puzzle, but --type is {puzzle_type.value}"
        )
    return date_text


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="tools.generate")
    parser.add_argument("--date", required=True, help="day in YYYY-MM-DD, or a full puzzle id")
    parser.add_argument("--size", type=int, help="board size (default: the type's published size)")
    parser.add_argument("--seed", type=int, help="defaults to a hash of --date")
    parser.add_argument("--out", type=Path, help="directory to write the puzzle into")
    parser.add_argument(
        "--logic-only",
        action="store_true",
        help="keep bumping the seed until the board passes its logic-only check",
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
    if args.logic_only and not book.logic_only and puzzle_type is not PuzzleType.TRAIN_TRACKS:
        print(
            f"--logic-only is not offered for {puzzle_type.value}: the rules do run on a "
            "multi-star board, but 0.1% of generated 8x8 boards finish without guessing, "
            "so the gate would reject essentially all of them",
            file=sys.stderr,
        )
        return 1

    base = args.seed if args.seed is not None else seed_from_date(puzzle_id)
    seed = base
    hint_check = {
        PuzzleType.TRAIN_TRACKS: tracks_hints_solve,
        PuzzleType.STAR_BATTLE: star_hints_solve,
    }.get(puzzle_type)
    for _attempt in range(LOGIC_ONLY_TRIES if args.logic_only or hint_check else 1):
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
        if hint_check:
            try:
                supported = hint_check(puzzle)
            except RuntimeError as error:
                print(f"generation failed: {error}", file=sys.stderr)
                return 1
            if not supported:
                seed = (seed + 1) % (2**32)
                continue
        deduced = book.deduce(puzzle.board, allow_guesses=False)
        if not args.logic_only or hint_check or (deduced is not None and deduced.solved):
            break
        seed = (seed + 1) % (2**32)
    else:
        print(
            f"no board for {puzzle_id} solved by the required hints or deductions in "
            f"{LOGIC_ONLY_TRIES} seed increments",
            file=sys.stderr,
        )
        return 1

    if not book.rated:
        print(f"difficulty: not rated ({puzzle_type.value} boards are unique but unscored)")
    else:
        difficulty = score_difficulty(as_marks_board(puzzle.board))
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
