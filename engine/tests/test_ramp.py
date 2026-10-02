"""The weekly difficulty ramp: the table, and the search that meets it.

The ramp is a product promise, so it gets tested as one. These tests pin the
shape of the week (neither size nor band may regress as the days advance), the
guarantee that whatever comes out is logic-only, and the rule that a rare target
falls back to the hardest board the budget found rather than to nothing.
"""

from __future__ import annotations

from dataclasses import replace
from datetime import date, timedelta
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from queens_engine import (
    LEVEL_NAMES,
    MAX_LEVEL,
    MIN_LEVEL,
    RAMP_ATTEMPTS,
    WEEKLY_RAMP,
    DifficultyTarget,
    GenerationConfig,
    GenerationError,
    Puzzle,
    deduce,
    generate_puzzle,
    generate_ramped,
    parse_puzzle,
    puzzle_to_dict,
    ramp,
    score_difficulty,
    target_for,
)

#: A Monday, so `timedelta` walks the week in ramp order.
MONDAY = date(2026, 10, 5)


def days_of_the_week() -> list[date]:
    return [MONDAY + timedelta(days=offset) for offset in range(7)]


def test_ramp_covers_every_weekday() -> None:
    assert len(WEEKLY_RAMP) == 7
    for offset, target in enumerate(WEEKLY_RAMP):
        assert target_for(MONDAY + timedelta(days=offset)) == target


def test_ramp_repeats_weekly() -> None:
    """The table is indexed by weekday, so it must not drift week to week."""
    later = date(2026, 12, 7)  # a Monday 9 weeks on
    assert target_for(later) == target_for(MONDAY)
    assert all(target_for(later + timedelta(days=n)) == WEEKLY_RAMP[n] for n in range(7))


def test_size_never_shrinks_across_the_week() -> None:
    sizes = [target.size for target in WEEKLY_RAMP]
    assert sizes == sorted(sizes)


def test_band_never_drops_across_the_week() -> None:
    levels = [target.level for target in WEEKLY_RAMP]
    assert levels == sorted(levels)


def test_week_opens_at_medium_and_closes_at_expert() -> None:
    assert WEEKLY_RAMP[0].level_name == "Medium"
    assert WEEKLY_RAMP[-1].level_name == "Expert"


def test_no_target_asks_for_nightmare() -> None:
    """Nightmare needs a guess, so no day may aim at it."""
    assert all(target.level < MAX_LEVEL for target in WEEKLY_RAMP)


def test_every_target_names_a_real_band() -> None:
    for target in WEEKLY_RAMP:
        assert MIN_LEVEL <= target.level <= MAX_LEVEL
        assert target.level_name == LEVEL_NAMES[target.level - 1]


def test_target_rejects_a_band_outside_the_scale() -> None:
    with pytest.raises(ValueError, match="outside"):
        DifficultyTarget(size=8, level=MAX_LEVEL + 1)


def test_every_size_in_the_ramp_has_a_search_budget() -> None:
    for target in WEEKLY_RAMP:
        assert RAMP_ATTEMPTS[target.size] > 0


def test_generated_board_is_logic_only() -> None:
    result = generate_ramped(seed=1, puzzle_id="2026-10-05", target=WEEKLY_RAMP[0], max_attempts=40)
    assert deduce(result.puzzle.board, allow_guesses=False).solved


def test_generated_board_uses_the_targets_size() -> None:
    result = generate_ramped(seed=1, puzzle_id="2026-10-05", target=WEEKLY_RAMP[0], max_attempts=40)
    assert result.puzzle.size == WEEKLY_RAMP[0].size


def test_result_reports_what_it_delivered() -> None:
    result = generate_ramped(seed=1, puzzle_id="2026-10-05", target=WEEKLY_RAMP[0], max_attempts=40)
    assert result.target == WEEKLY_RAMP[0]
    assert result.achieved.size == result.target.size
    assert result.achieved.level == score_difficulty(result.puzzle.board).level
    assert 1 <= result.attempts <= 40


def test_never_publishes_a_board_harder_than_the_target() -> None:
    """An Expert Tuesday would break the ramp as surely as a Nightmare Monday."""
    easy_monday = DifficultyTarget(size=7, level=MIN_LEVEL)
    result = generate_ramped(seed=3, puzzle_id="2026-10-05", target=easy_monday, max_attempts=60)
    assert result.achieved.level <= easy_monday.level


def test_falls_back_to_the_hardest_board_it_found() -> None:
    """A target no board reaches must still return the best one, not fail.

    Level 5 at 9x9 is Nightmare, which no logic-only board attains, so the search
    has to exhaust its budget and settle for whatever it saw.
    """
    unreachable = DifficultyTarget(size=5, level=MAX_LEVEL)
    result = generate_ramped(seed=11, puzzle_id="2026-10-05", target=unreachable, max_attempts=30)
    assert result.target == unreachable
    assert result.achieved.level < unreachable.level
    assert result.achieved.level >= MIN_LEVEL
    assert result.attempts == 30


def test_fallback_keeps_the_hardest_board_not_the_last() -> None:
    """The fallback is the best board seen, so a bigger budget can only help.

    Level 5 is unreachable, so each run returns the hardest logic-only board
    within its budget. Giving the search more boards must never lower the band it
    settles for; if the fallback took the last board instead, this would wobble.
    """
    unreachable = DifficultyTarget(size=5, level=MAX_LEVEL)
    bands = [
        generate_ramped(
            seed=7, puzzle_id="2026-10-05", target=unreachable, max_attempts=budget
        ).achieved.level
        for budget in (5, 15, 30, 60)
    ]
    assert bands == sorted(bands)


def test_tries_the_supplied_seed_first() -> None:
    """`max_attempts=1` must test the seed it was given, not the next one.

    The seed-walking contract is that a date's board starts from its own derived
    seed. If the walk advanced first, a day whose own seed happens to be a
    logic-only board at the target would be skipped, and the search could run out
    of budget with nothing to show for it.

    Patched generation makes the seed observable. A Nightmare target on a 5x5 is
    not reachable, so the search always walks its whole budget and the sequence of
    seeds is visible rather than stopping on a hit.
    """
    asked: list[int] = []

    def record(seed: int, **_kwargs: object) -> Puzzle:
        asked.append(seed)
        return generate_puzzle(seed=seed, puzzle_id="2026-10-05", config=GenerationConfig(size=5))

    target = DifficultyTarget(size=5, level=MAX_LEVEL)
    with patch.object(ramp, "generate_puzzle", record):
        generate_ramped(seed=1234, puzzle_id="2026-10-05", target=target, max_attempts=3)

    assert asked == [1234, 1235, 1236]


def test_generation_is_reproducible_from_the_seed() -> None:
    """The pipeline publishes from a date-derived seed, so this must be stable."""
    first = generate_ramped(seed=99, puzzle_id="2026-10-05", target=WEEKLY_RAMP[0], max_attempts=40)
    second = generate_ramped(
        seed=99, puzzle_id="2026-10-05", target=WEEKLY_RAMP[0], max_attempts=40
    )
    assert first.puzzle.board == second.puzzle.board
    assert first.achieved == second.achieved


def test_no_logic_only_board_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    """A search that reaches no logic-only board must fail loudly.

    Patched rather than seeded: whether a particular seed happens to need a guess
    is generator behaviour that could change, and this is about the contract.
    """

    def never_generates(**_kwargs: object) -> Puzzle:
        raise GenerationError("no board for this seed")

    monkeypatch.setattr(ramp, "generate_puzzle", never_generates)
    with pytest.raises(GenerationError, match="no logic-only"):
        generate_ramped(seed=5, puzzle_id="2026-10-05", target=WEEKLY_RAMP[0], max_attempts=3)


def test_a_board_needing_a_guess_is_never_published(monkeypatch: pytest.MonkeyPatch) -> None:
    """The guarantee the whole ramp rests on, checked directly.

    Generation keeps succeeding; only the logic-only verdict is stubbed out to
    "unsolved". The search must then find nothing at all rather than fall back to
    a board that needs a hypothesis.
    """

    def never_solvable(*_args: object, **_kwargs: object) -> SimpleNamespace:
        return SimpleNamespace(solved=False)

    monkeypatch.setattr(ramp, "deduce", never_solvable)
    with pytest.raises(GenerationError, match="no logic-only"):
        generate_ramped(seed=5, puzzle_id="2026-10-05", target=WEEKLY_RAMP[0], max_attempts=3)


def test_rejects_an_empty_budget() -> None:
    with pytest.raises(ValueError, match="max_attempts"):
        generate_ramped(seed=5, puzzle_id="2026-10-05", target=WEEKLY_RAMP[0], max_attempts=0)


def test_recorded_band_survives_a_file_round_trip() -> None:
    result = generate_ramped(seed=1, puzzle_id="2026-10-05", target=WEEKLY_RAMP[0], max_attempts=40)
    recorded = replace(result.puzzle, difficulty=result.achieved.level)
    data = puzzle_to_dict(recorded)
    assert data["difficulty"] == result.achieved.level
    assert parse_puzzle(data).difficulty == result.achieved.level


def test_a_band_is_omitted_rather_than_written_as_null() -> None:
    """Pre-ramp files have no band; nothing should start writing `null`."""
    result = generate_ramped(seed=1, puzzle_id="2026-10-05", target=WEEKLY_RAMP[0], max_attempts=40)
    assert "difficulty" not in puzzle_to_dict(replace(result.puzzle, difficulty=None))
