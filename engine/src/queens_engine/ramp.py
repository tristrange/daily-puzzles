"""The weekly difficulty ramp: which board a given weekday aims for.

Two levers, both in play. **Size** sets the floor — a 9x9 board is never Easy,
whatever seed it lands on, so the weekend can be made genuinely larger without
depending on luck. **Band** is what the seed search then aims for, because
within one size the logic depth varies enormously: measured over 130 logic-only
8x8 boards the score ran from 14 to 92, spanning four bands.

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

Nightmare is deliberately absent. It is unreachable without guessing: measured
over 400 logic-only 7x7 boards and 130 at 8x8, not one was Nightmare, and every
Nightmare board found needed at least one hypothesis. The pipeline's promise is
that a board is solvable by logic alone, and spending that promise to buy one
more band would be a bad trade. The reachable top is Expert. Raising it further
means giving the deduction engine stronger rules so that harder boards *become*
logic-only, not relaxing what "logic-only" means.

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
#: Not uniform, because a 9x9 board costs about 9s against 8x8's 0.66s, so the
#: same budget would be 14x the wall clock. The budgets are set from measured
#: logic-only hit rates: Expert is 1 board in 130 at 8x8 but only 1 in 12 at 9x9,
#: which is why the ramp peaks at 9x9 rather than trying to force Expert at 8x8.
#: Even so a 9x9 weekend sits near 3 minutes a day, so a lead window that spans a
#: Friday-Sunday can run for several minutes; that is the price of the peak and
#: it is paid nightly, not on request.
RAMP_ATTEMPTS: Final[dict[int, int]] = {5: 200, 6: 200, 7: 200, 8: 200, 9: 60}


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

    Bumps the seed exactly as the daily pipeline already does, so the board a
    date produces is reproducible from its id alone and CI can replay it.
    Raises `GenerationError` if no logic-only board at all turns up.
    """
    budget = max_attempts if max_attempts is not None else RAMP_ATTEMPTS.get(target.size, 200)
    if budget < 1:
        raise ValueError(f"max_attempts must be at least 1, got {max_attempts}")

    config = GenerationConfig(size=target.size, puzzle_type=PuzzleType.QUEENS)
    best: tuple[Puzzle, int] | None = None
    attempts = 0
    cursor = seed

    while attempts < budget:
        attempts += 1
        cursor = (cursor + 1) % (2**32)
        try:
            puzzle = generate_puzzle(seed=cursor, puzzle_id=puzzle_id, config=config)
        except GenerationError:
            continue
        if not deduce(puzzle.board, allow_guesses=False).solved:
            continue
        level = score_difficulty(puzzle.board).level
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
