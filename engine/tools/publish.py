"""Generate the missing daily puzzles and keep the archive published.

Usage:
    python -m tools.publish [--out DIR] [--lead 3] [--start YYYY-MM-DD] [--dry-run]

Each day carries one puzzle per registered type: the Queens board named after
the day, and its Star Battle companion named `<date>-star.json`. The suffix is
part of the puzzle's identity rather than only its filename, because a solve is
recorded against an id and first-solve-wins would otherwise let one of the day's
puzzles block the other. Which types exist, what they are called and how each is
generated all come from the registry in `queens_engine.rulebook`, so this script
holds no per-type knowledge of its own.

A Star Battle board also refuses to repeat a solution layout published within
`STAR_LAYOUT_WINDOW_DAYS` days: because the generator is stars-first, two
different seeds can land on the same star arrangement, and back-to-back days
that share one would be playable by memory exactly like the 8x8 boards this
size change replaced. The repeat check bumps the seed like any other failed
draw, so a published file still replays deterministically from the seed it
records.

Scans DIR for committed puzzle files and fills the gaps from the first missing
day through (today + `--lead` days), using the same deterministic recipe as
`tools.generate`: a seed hashed from the id and the type's published size. How
each type is generated is its rulebook's `on_ramp` fact. A ramped type walks the
seed upward until a logic-only board lands within its weekday's band and records
that band; a type off the ramp takes the guarantee the generator actually
provides for it, a unique solution, and records no band. Idempotent: existing
files are never rewritten and a given id always maps to one puzzle, so it is safe
to run from cron every day and to run again by hand.
"""

from __future__ import annotations

import argparse
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from dataclasses import replace
from typing import Final

from tools.generate import LOGIC_ONLY_TRIES, seed_from_date

from queens_engine import (
    LEVEL_NAMES,
    GenerationError,
    Puzzle,
    PuzzleType,
    dumps_puzzle,
    generate_ramped,
    iter_solutions,
    load_puzzle,
    puzzle_id,
    rulebook_for,
    rulebooks,
    score_difficulty,
    split_puzzle_id,
    target_for,
)

#: How many days ahead of "today" the archive should stay published.
DEFAULT_LEAD_DAYS = 3

#: A new Star Battle board must not share its solution layout with one published
#: within this many days before it. The generator is stars-first, so an unrelated
#: seed can land on the same arrangement; back-to-back repeats would be playable
#: from memory and recreate the guessability `STAR_BATTLE_SIZE` already avoids.
STAR_LAYOUT_WINDOW_DAYS: Final[int] = 14


def _star_layout(puzzle: Puzzle) -> tuple[tuple[int, ...], ...]:
    """The board's star arrangement: each row's sorted star columns.

    Star Battle boards are unique-solution, so the first solution is the
    arrangement a player has to produce; two boards with the same sequence of
    row-pairs are the same board to play, whatever their regions look like.
    """
    pairs: list[list[int]] = [[] for _ in range(puzzle.size)]
    for cell in next(iter(iter_solutions(puzzle.board))):
        pairs[cell // puzzle.size].append(cell % puzzle.size)
    return tuple(tuple(sorted(row)) for row in pairs)


def _recent_star_layouts(
    out_dir: Path, before: date, *, window: int = STAR_LAYOUT_WINDOW_DAYS
) -> set[tuple[tuple[int, ...], ...]]:
    """The layouts already published in the `window` days before `before`.

    This is what the repeat check measures against on a given day. Only files on
    disk count, so a day's fate is decided by what is already committed, never by
    a transient: rerunning the tool yields the same boards. The window includes
    the day exactly `window` days back and excludes `before` itself, so "the
    previous two weeks" is a full fourteen days. Layouts are compared as shapes,
    so a past day of another size can never accidentally match — different sizes
    have different row counts.
    """
    recent: set[tuple[tuple[int, ...], ...]] = set()
    for day_id in out_dir.glob("*.json"):
        split = split_puzzle_id(day_id.stem)
        if split is None:
            continue
        day, puzzle_type = split
        if not (before - timedelta(days=window) <= day < before):
            continue
        if puzzle_type is PuzzleType.STAR_BATTLE:
            recent.add(_star_layout(load_puzzle(day_id)))
    return recent


def _existing(out_dir: Path) -> tuple[set[str], set[date]]:
    """The committed puzzle ids and the days they cover.

    Ids come from `split_puzzle_id`, so what counts as a puzzle file is the
    registry's set of names rather than a regex written beside it. The day is
    taken from that same split, which is why this no longer strips the suffix by
    hand — `rstrip` removes characters, not a suffix, and only looked right
    because a date always ends in a digit.
    """
    ids: set[str] = set()
    days: set[date] = set()
    for path in out_dir.glob("*.json"):
        split = split_puzzle_id(path.stem)
        if split is None:
            continue
        day, _puzzle_type = split
        ids.add(path.stem)
        days.add(day)
    return ids, days


def _ids_for_day(day: date) -> tuple[str, ...]:
    """The puzzle ids a day carries, one per registered type, in registry order."""
    return tuple(puzzle_id(day, book.puzzle_type) for book in rulebooks())


def _first_incomplete_day(existing: set[str], first: date, end: date) -> date | None:
    """The earliest day up to `end` that is missing either of its puzzles.

    Deliberately the earliest rather than the latest: a run that died between
    writing one puzzle of a day and writing the other has left a half-published
    day, and resuming after the newest committed day would step straight over it
    and never fill it in.
    """
    for offset in range((end - first).days + 1):
        day = first + timedelta(days=offset)
        if any(puzzle_id not in existing for puzzle_id in _ids_for_day(day)):
            return day
    return None


def _generate(
    puzzle_type: PuzzleType,
    day_id: str,
    seed: int,
    avoid_layouts: set[tuple[tuple[int, ...], ...]] | None = None,
) -> tuple[Puzzle, float | None]:
    """Generate one day of one type, and its difficulty score if it has one.

    Which recipe a type gets is its rulebook's `on_ramp` fact, not a branch
    written here, so publishing a new type is a registry entry rather than a new
    function in this file.

    A ramped type goes through the weekly ramp in `queens_engine.ramp`, which
    picks the size and band from the date and walks the seed upward until a board
    lands at or below that band, so a date always reproduces the same board. The
    band is recorded on the file, because the ramp is a claim about difficulty.

    A type off the ramp takes the guarantee the generator actually provides for
    it — a unique solution, but not a promise that no guessing is needed — and
    records no band, so nothing in the archive claims a difficulty nothing checks.
    Its failure path is a seed bump instead, since there is no band to search for.
    A Star Battle board also bumps while its solution layout repeats one in
    `avoid_layouts`, the same memory-play caveat as `STAR_BATTLE_SIZE`.
    """
    book = rulebook_for(puzzle_type)
    if book.on_ramp:
        target = target_for(date.fromisoformat(day_id))
        try:
            result = generate_ramped(seed=seed, puzzle_id=day_id, target=target)
        except GenerationError as error:
            raise RuntimeError(f"{day_id}: {error}") from error
        if result.achieved.level < target.level:
            print(
                f"  note: {target.size}x{target.size} {target.level_name} was not in "
                f"{result.attempts} boards, published {result.achieved.level_name}"
            )
        return replace(result.puzzle, difficulty=result.achieved.level), score_difficulty(
            result.puzzle.board
        ).score
    for _bump in range(LOGIC_ONLY_TRIES):
        try:
            puzzle = book.generate(seed=seed, puzzle_id=day_id)
        except GenerationError:
            seed = (seed + 1) % (2**32)
            continue
        if (
            avoid_layouts is not None
            and book.puzzle_type is PuzzleType.STAR_BATTLE
            and _star_layout(puzzle) in avoid_layouts
        ):
            seed = (seed + 1) % (2**32)
            continue
        return puzzle, None
    raise RuntimeError(f"{day_id}: no {puzzle_type.value} board in {LOGIC_ONLY_TRIES} seed bumps")


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
    existing, days = _existing(args.out)
    today = date.today()

    end = today + timedelta(days=args.lead)

    if args.start is not None:
        start = date.fromisoformat(args.start)
    elif days:
        # Resume at the first day that is not completely published, which may be
        # long before the newest one; if everything up to the lead horizon is
        # complete there is nothing to do.
        incomplete = _first_incomplete_day(existing, min(days), end)
        start = incomplete if incomplete is not None else end + timedelta(days=1)
    else:
        start = today

    window = start
    while window <= end:
        for book in rulebooks():
            day_id = puzzle_id(window, book.puzzle_type)
            if day_id in existing:
                print(f"skip   {day_id} (already published)")
                continue
            print(f"publish {day_id}" + (" (dry run)" if args.dry_run else ""))
            if args.dry_run:
                continue
            seed = seed_from_date(day_id)
            try:
                puzzle, score = _generate(
                    book.puzzle_type,
                    day_id,
                    seed,
                    _recent_star_layouts(args.out, window),
                )
            except RuntimeError as error:
                print(f"error: {error}", file=sys.stderr)
                return 1
            (args.out / f"{day_id}.json").write_text(dumps_puzzle(puzzle), encoding="utf-8")
            # A layout written this run is on disk and therefore in the window
            # for every later day, so the next iteration's scan picks it up; no
            # bookkeeping of what this run itself produced is needed.
            # An unrated board says so rather than printing a number that means
            # something weaker than the same number on a ramped board.
            band = (
                f" {LEVEL_NAMES[puzzle.difficulty - 1]}"
                if puzzle.difficulty is not None
                else " (not rated)"
            )
            print(
                f"  seed {puzzle.seed} size {puzzle.size}{band}"
                + (f" score {score:g}" if score is not None else " (unique, not logic-gated)")
            )
        window += timedelta(days=1)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
