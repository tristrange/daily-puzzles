"""Generate the missing daily puzzles and keep the archive published.

Usage:
    python -m tools.publish [--out DIR] [--lead 3] [--start YYYY-MM-DD] [--dry-run]
                            [--check]

Each family provides its daily slots: Queens and Star Battle each provide one;
Train Tracks provides a legacy slot before activation and three named sizes afterward. The suffix is
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

`--check` is the monitor's read-only mode: it reports the first incomplete day
through the lead horizon and exits 1 without writing anything.
"""

from __future__ import annotations

import argparse
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from dataclasses import replace

from tools.generate import LOGIC_ONLY_TRIES, seed_from_date

from queens_engine import (
    LEVEL_NAMES,
    STAR_LAYOUT_WINDOW_DAYS,
    GenerationError,
    Puzzle,
    PuzzleType,
    as_marks_board,
    dumps_puzzle,
    generate_ramped,
    load_puzzle,
    rulebook_for,
    rulebooks,
    score_difficulty,
    split_puzzle_id,
    star_layout,
    target_for,
)

#: How many days ahead of "today" the archive should stay published.
DEFAULT_LEAD_DAYS = 3

#: The first day the archive must cover. A monitor cannot infer this from the
#: files, because deleting every puzzle for the first day would move the minimum
#: forward and hide the gap.
ARCHIVE_START = date(2026, 9, 26)


def _nearby_star_layouts(
    out_dir: Path, day: date, *, window: int = STAR_LAYOUT_WINDOW_DAYS
) -> set[tuple[tuple[int, ...], ...]]:
    """The layouts already on disk within `window` days of `day`.

    This is what the repeat check measures against for one day. Only files on
    disk count, so a day's fate is decided by what is already committed, never by
    a transient: rerunning the tool yields the same boards. The window is both
    directions and inclusive on both edges: the layout of a board published
    exactly `window` days earlier or later counts, so "two weeks" is a full
    fourteen days either way. Filling an earlier gap must also avoid layouts of
    already-published later days, because those days have their own backward
    windows and would themselves be playable-from-memory once this day lands.
    Layouts are compared as shapes, so a past day of another size can never
    accidentally match — different sizes have different row counts.
    """
    recent: set[tuple[tuple[int, ...], ...]] = set()
    for day_id in out_dir.glob("*.json"):
        split = split_puzzle_id(day_id.stem)
        if split is None:
            continue
        other, puzzle_type = split
        if other == day or abs(other - day).days > window:
            continue
        if puzzle_type is PuzzleType.STAR_BATTLE:
            recent.add(star_layout(as_marks_board(load_puzzle(day_id).board)))
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
    """The slots a day requires, in family order and then variant order.

    `published` rather than `rulebooks()`, because this answers "what must exist on
    disk for the day to count as complete" and an unregistered-as-published type is
    never written, so counting it would make every past day look incomplete and the
    resume would never advance.
    """
    return tuple(
        identifier for book in rulebooks() if book.published for identifier in book.daily_ids(day)
    )


def _first_incomplete_day(existing: set[str], first: date, end: date) -> date | None:
    """The earliest day up to `end` that is missing any required slot.

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


def _check_horizon(existing: set[str], start: str | None, end: date) -> int:
    """Report the first incomplete day through `end`, without writing anything."""
    first = date.fromisoformat(start) if start is not None else ARCHIVE_START
    incomplete = _first_incomplete_day(existing, first, end)
    if incomplete is None:
        print(f"archive complete through {end}")
        return 0
    missing = [identifier for identifier in _ids_for_day(incomplete) if identifier not in existing]
    print(
        f"error: {incomplete} is incomplete; missing {', '.join(missing)}",
        file=sys.stderr,
    )
    return 1


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
    A Star Battle board also bumps while its solution layout is in
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
            as_marks_board(result.puzzle.board)
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
            and star_layout(as_marks_board(puzzle.board)) in avoid_layouts
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
    parser.add_argument(
        "--check",
        action="store_true",
        help="exit 1 if any required slot through the lead horizon is missing",
    )
    args = parser.parse_args(argv)

    args.out.mkdir(parents=True, exist_ok=True)
    existing, days = _existing(args.out)
    today = date.today()

    end = today + timedelta(days=args.lead)

    if args.check:
        return _check_horizon(existing, args.start, end)

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
            if not book.published:
                continue
            for day_id in book.daily_ids(window):
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
                        _nearby_star_layouts(args.out, window),
                    )
                except RuntimeError as error:
                    print(f"error: {error}", file=sys.stderr)
                    return 1
                path = args.out / f"{day_id}.json"
                temporary = path.with_suffix(".json.tmp")
                # A failed write must never look like a published slot on restart.
                try:
                    temporary.write_text(dumps_puzzle(puzzle), encoding="utf-8")
                    temporary.replace(path)
                finally:
                    temporary.unlink(missing_ok=True)
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
                width, height = book.dimensions(puzzle)
                print(
                    f"  seed {puzzle.seed} size {width}x{height}{band}"
                    + (
                        f" score {score:g}"
                        if score is not None
                        else " (unique, direct deductions)"
                        if book.logic_only
                        else " (unique, not logic-gated)"
                    )
                )
        window += timedelta(days=1)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
