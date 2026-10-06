"""Re-verify every committed puzzle: shape and byte-for-byte replay.

Usage:
    python -m tools.verify [--dir ../app/public/puzzles]

Every published puzzle must still parse against the schema/board rules and must
regenerate byte-for-byte from its own seed (`verify_replay`). This is the daily
pipeline's guard: CI runs it over the committed archive, and the cron job runs
it again on the files it is about to commit, so a generator change cannot drift
the archive silently.

A Star Battle file must also keep its distance from its neighbours: a board
published within `STAR_LAYOUT_WINDOW_DAYS` of another with the same solution
layout would be playable from memory, how ever the file got into the archive, so
the replay checks are not enough on their own. Verifying here closes the gap
left by publish, which enforces the rule only when it generates a file.
"""

from __future__ import annotations

import argparse
import sys
from datetime import date, timedelta
from pathlib import Path
from typing import NamedTuple

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from queens_engine import (
    LEVEL_NAMES,
    RAMP_START,
    STAR_LAYOUT_WINDOW_DAYS,
    Puzzle,
    PuzzleParseError,
    PuzzleType,
    dumps_puzzle,
    load_puzzle,
    rulebook_for,
    split_puzzle_id,
    star_layout,
    target_for,
    verify_replay,
)


class RampCheck(NamedTuple):
    """What the ramp made of one file.

    A `problem` is a reason to fail verification, kept separate from `note` so a
    broken ramp cannot be reported as a passing file with an odd-looking remark.
    """

    note: str
    problem: str | None = None


def _star_repeat_problem(
    day: date,
    puzzle: Puzzle,
    seen: list[tuple[date, tuple[tuple[int, ...], ...]]],
) -> str | None:
    """Why a star puzzle breaks the repeat window, or None if it does not.

    Non-star puzzles are not in the repeat rule, and star boards only matter
    against layouts published on a day within `STAR_LAYOUT_WINDOW_DAYS` before
    them. `seen` holds those layouts in ascending day order, so once a file is
    more than the window behind, nothing earlier can be closer and the scan can
    stop. A board that passes is appended, holding later files to the same rule.
    """
    if puzzle.puzzle_type is not PuzzleType.STAR_BATTLE:
        return None
    layout = star_layout(puzzle)
    for other_day, other_layout in seen:
        if day - other_day > timedelta(days=STAR_LAYOUT_WINDOW_DAYS):
            break
        if layout == other_layout:
            return (
                f"repeats the solution layout published on {other_day.isoformat()} "
                f"(within {STAR_LAYOUT_WINDOW_DAYS} days)"
            )
    seen.append((day, layout))
    return None


def _ramp_check(day_text: str, puzzle_type: PuzzleType, puzzle: Puzzle) -> RampCheck:
    """Check a puzzle against the ramp for its weekday.

    Four rules:

    - A Queens file dated on or after `RAMP_START` must carry a band, and that
      band must be within its weekday's target. Anything earlier predates the
      ramp, so its 8x8 size is history and nothing is claimed about it.
    - Star Battle is never checked: it is not on the ramp until the deduction
      engine can rate a star board.

    Falling *short* of the target band is legal — the search reports it and
    publishes the hardest board it found. Falling above it, or a wrong size, is
    not: that is the ramp being broken, and the caller fails the run.

    Eligibility is a property of the type, read from its rulebook, and the type
    is the one the file declares. It used to come from the filename instead, which
    meant a 7x7 Queens board named `2026-10-12-star.json` skipped the check
    entirely and was accepted on a Monday that targets Medium.
    """
    if not rulebook_for(puzzle_type).on_ramp:
        return RampCheck("")
    day = date.fromisoformat(day_text)
    target = target_for(day)
    if puzzle.difficulty is None:
        if day < RAMP_START:
            return RampCheck("")
        problem = f"no difficulty recorded; {day} is on or after {RAMP_START}"
        return RampCheck("", problem)
    band = LEVEL_NAMES[puzzle.difficulty - 1]
    if puzzle.size != target.size:
        problem = f"{puzzle.size}x{puzzle.size}, expected {target.size}x{target.size}"
        return RampCheck("", problem)
    if puzzle.difficulty > target.level:
        return RampCheck("", f"{band} is above {target.level_name}")
    return RampCheck(f"ramp {band} (target {target.level_name})")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="tools.verify")
    parser.add_argument("--dir", type=Path, default=Path("./puzzles"))
    args = parser.parse_args(argv)

    total = 0
    failed: list[str] = []
    star_layouts_seen: list[tuple[date, tuple[tuple[int, ...], ...]]] = []
    for path in sorted(args.dir.glob("*.json")):
        split = split_puzzle_id(path.stem)
        if split is None:
            print(f"skip {path.name} (not a date-keyed puzzle file)")
            continue
        day, name_type = split
        total += 1
        try:
            raw = path.read_text(encoding="utf-8")
            puzzle = load_puzzle(path)
            verify_replay(puzzle)
            # The suffix and the declared type are two claims about one file, and
            # a disagreement means the archive and the app disagree about what the
            # file is: the app derives the type from the name, so a file that lies
            # about its own type is shown under the wrong game's heading.
            if puzzle.puzzle_type is not name_type:
                raise ValueError(
                    f"filename says {name_type.value}, file declares {puzzle.puzzle_type.value}"
                )
            ramp = _ramp_check(day.isoformat(), puzzle.puzzle_type, puzzle)
        except (PuzzleParseError, ValueError) as error:
            failed.append(f"{path}: {error}")
            print(f"{path.name}: FAILED ({error})")
            continue
        if ramp.problem is not None:
            # A board that breaks the ramp is a failed verification, not a note:
            # this is the check that stops the pipeline shipping it.
            problem = f"RAMP MISMATCH ({ramp.problem})"
            failed.append(f"{path}: {problem}")
            print(f"{path.name}: FAILED ({problem})")
            continue
        # A board added with a replay-valid seed bypasses publish and its
        # repeat rule; failing here keeps the archive invariant whatever the
        # file's origin.
        if problem := _star_repeat_problem(day, puzzle, star_layouts_seen):
            failed.append(f"{path}: {problem}")
            print(f"{path.name}: FAILED ({problem})")
            continue
        # Replaying the seed proves the *puzzle* is unchanged; it says nothing
        # about the bytes. A file reformatted by hand or by a different writer
        # still verifies, and the archive then stops being byte-stable, which is
        # the property the next schema migration depends on. One committed file
        # was already in this state, with identical data and expanded arrays.
        if dumps_puzzle(puzzle) != raw:
            problem = "not in canonical form (arrays must stay on one line)"
            failed.append(f"{path}: {problem}")
            print(f"{path.name}: FAILED ({problem})")
            continue
        label = f"{path.name}: ok ({puzzle.board.size}x{puzzle.board.size}"
        label += f", seed {puzzle.seed}, v{puzzle.generator_version}, replay match"
        if ramp.note:
            label += f", {ramp.note}"
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
