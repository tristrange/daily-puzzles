"""The weekly difficulty ramp: which board a given weekday aims for.

Two levers, both in play. **Size** sets the floor — a 9x9 board is never Easy,
whatever seed it lands on, so the weekend can be made genuinely larger without
depending on luck. **Band** is what the seed search then aims for, because
within one size the logic depth varies: the same 8x8 size turns up both Medium
and Expert boards.

Both move together and neither regresses across the week:

===== ======== =======
Day   Size     Band
===== ======== =======
Mon   7x7      Medium
Tue   8x8      Medium
Wed   8x8      Hard
Thu   8x8      Hard
Fri   9x9      Hard
Sat   9x9      Expert
Sun   9x9      Expert
===== ======== =======

Neither lever regresses: size steps 7, 8, 8, 8, 9, 9, 9 and band steps Medium
through to Expert, so the weekend boards are both the largest and the deepest.
The Friday 9x9 introduces the big board a day before the peak, so the week ends
on size *and* depth at once rather than only on depth.

Nightmare is deliberately absent as a target. The pipeline's promise is that a
board is solvable by logic alone; version 3 does turn up logic-only 9x9
Nightmare boards — about one in twelve of the logic-only boards sampled — but
the ramp tops at Expert, which every weekly size reaches reliably. Raising the
ceiling is a separate decision about what Sunday should cost, not something a
generator change should make on its own.

The search aims at the target and keeps the best board the budget turns up, so a
day whose target is rare still publishes something hard instead of nothing. It
never accepts a board *harder* than the target: an Expert Tuesday would break
the ramp as surely as a Nightmare Monday.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Final

from queens_engine.board import PuzzleType
from queens_engine.deduce import deduce
from queens_engine.difficulty import LEVEL_NAMES, score_difficulty
from queens_engine.generator import GenerationConfig, GenerationError, generate_puzzle
from queens_engine.puzzle import Puzzle
from queens_engine.rulebook import as_marks_board

#: Lowest and highest band index, 1-based into `LEVEL_NAMES`.
MIN_LEVEL: Final[int] = 1
MAX_LEVEL: Final[int] = len(LEVEL_NAMES)


@dataclass(frozen=True, slots=True)
class DifficultyTarget:
    """A board size and the band the seed search aims for."""

    size: int
    level: int

    def __post_init__(self) -> None:
        if not MIN_LEVEL <= self.level <= MAX_LEVEL:
            raise ValueError(f"level {self.level} outside [{MIN_LEVEL}, {MAX_LEVEL}]")

    @property
    def level_name(self) -> str:
        return LEVEL_NAMES[self.level - 1]


#: The first day published under the ramp. Queens files dated before this were
#: published when every board was 8x8 and no band was recorded, so their size is
#: a historical fact rather than a claim, and `tools/verify` leaves them alone.
#: From this date on, a Queens file must carry a band that matches its weekday.
RAMP_START: Final[date] = date(2026, 10, 5)

#: The type this ramp builds boards for. Not read from the rulebook, because being
#: on the ramp and being the ramp's type are different claims: a second ramped type
#: would need its own band search, since `score_difficulty`'s rule weights and
#: `RAMP_ATTEMPTS` are both tuned for one star per row. `test_rulebook` asserts that
#: the set of types marked `on_ramp` is exactly this one, so marking a type
#: `on_ramp` without teaching the ramp to build it fails rather than quietly
#: publishing boards with no band.
RAMP_TYPE: Final[PuzzleType] = PuzzleType.QUEENS

#: Monday first, matching `date.weekday()`.
WEEKLY_RAMP: Final[tuple[DifficultyTarget, ...]] = (
    DifficultyTarget(size=7, level=2),
    DifficultyTarget(size=8, level=2),
    DifficultyTarget(size=8, level=3),
    DifficultyTarget(size=8, level=3),
    DifficultyTarget(size=9, level=3),
    DifficultyTarget(size=9, level=4),
    DifficultyTarget(size=9, level=4),
)

#: How many seeds a search may try before settling for the best board it found.
#: The budget counts *attempts*, not boards produced, because a seed that cannot
#: generate at all has to count against it too or the loop would never end.
#: Size 8 gets the largest budget even though 9x9 is the expensive board to build:
#: version 3 produces Medium rarely at 8x8 (roughly one logic-only board in
#: thirty), and Tuesday asks for exactly that, so the search needs the extra
#: seeds. Size 9 stays small because Expert is common there, while Nightmare is
#: skipped as harder than the target. A 9x9 seed costs about 0.7s against 8x8's
#: 0.12s, and both budgets are paid nightly rather than on request.
RAMP_ATTEMPTS: Final[dict[int, int]] = {5: 200, 6: 200, 7: 200, 8: 600, 9: 60}


def target_for(day: date) -> DifficultyTarget:
    """The target `day` aims for, from its weekday."""
    return WEEKLY_RAMP[day.weekday()]


@dataclass(frozen=True, slots=True)
class RampedPuzzle:
    """A board that met a target, or the hardest one the budget turned up."""

    puzzle: Puzzle
    #: What was aimed for.
    target: DifficultyTarget
    #: What was delivered. Below `target.level` when the budget ran out.
    achieved: DifficultyTarget
    #: How many seeds it tried, including the ones that never generated.
    attempts: int


def generate_ramped(
    *,
    seed: int,
    puzzle_id: str,
    target: DifficultyTarget,
    max_attempts: int | None = None,
) -> RampedPuzzle:
    """Generate a logic-only Queens puzzle at or below `target`'s band.

    Tries `seed` itself first, then walks upward one seed at a time, exactly as
    the daily pipeline does, so the board a date produces is reproducible from its
    id alone and CI can replay it. Stops as soon as a board hits the target band;
    otherwise settles for the hardest logic-only board at or below it, so a quiet
    patch never publishes something easier than it had to be.

    Raises `GenerationError` if no logic-only board at all turns up.
    """
    budget = max_attempts if max_attempts is not None else RAMP_ATTEMPTS.get(target.size, 200)
    if budget < 1:
        raise ValueError(f"max_attempts must be at least 1, got {max_attempts}")

    config = GenerationConfig(size=target.size, puzzle_type=RAMP_TYPE)
    best: tuple[Puzzle, int] | None = None
    attempts = 0
    cursor = seed

    # The supplied seed is tried first, then the budget walks upward from it, so
    # `max_attempts=1` tests exactly the seed it was given and a day that already
    # has a board at the target keeps it. Matches the seed-bumping contract the
    # publisher's other path uses.
    while attempts < budget:
        attempts += 1
        try:
            puzzle = generate_puzzle(seed=cursor, puzzle_id=puzzle_id, config=config)
        except GenerationError:
            cursor = (cursor + 1) % (2**32)
            continue
        cursor = (cursor + 1) % (2**32)
        # `generate_puzzle` is asked for `RAMP_TYPE`, so its board is a marks one.
        # Narrowing says so out loud rather than leaving the reader to wonder.
        board = as_marks_board(puzzle.board)
        if not deduce(board, allow_guesses=False).solved:
            continue
        level = score_difficulty(board).level
        if level == target.level:
            return RampedPuzzle(puzzle, target, target, attempts)
        if level < target.level and (best is None or level > best[1]):
            best = (puzzle, level)

    if best is not None:
        achieved = DifficultyTarget(size=target.size, level=best[1])
        return RampedPuzzle(best[0], target, achieved, attempts)
    raise GenerationError(
        f"no logic-only {target.size}x{target.size} board in {budget} attempts for {puzzle_id}"
    )


__all__ = [
    "MAX_LEVEL",
    "MIN_LEVEL",
    "RAMP_ATTEMPTS",
    "WEEKLY_RAMP",
    "DifficultyTarget",
    "RampedPuzzle",
    "generate_ramped",
    "target_for",
]
