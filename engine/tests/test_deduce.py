"""The deduction engine replays logic, so its one hard requirement is that it
never mislead: whatever it places or eliminates must be a fact the exact solver
agrees with. These tests hammer that against freshly generated boards, pin
determinism (a difficulty score must be a function of the board, not of hash
order or luck), and anchor the rule set so a regression in any rule is caught by
a named fixture.
"""

from __future__ import annotations

from hypothesis import given, settings
from hypothesis import strategies as st

from queens_engine import (
    DEFAULT_GUESS_CAP,
    Board,
    Difficulty,
    GenerationConfig,
    PuzzleType,
    deduce,
    generate_puzzle,
    score_difficulty,
)
from queens_engine.deduce import (
    INTERSECTION,
    SUBSET,
    TRIAL,
    DeductionError,
)
from queens_engine.difficulty import RULE_WEIGHTS
from queens_engine.solver import iter_solutions

SIZES = (5, 6, 7, 8)
SEEDS = st.integers(min_value=0, max_value=2**32 - 1)
SIZE_ST = st.sampled_from(SIZES)


def _board(size: int, seed: int) -> Board:
    return generate_puzzle(seed=seed, puzzle_id="x", config=GenerationConfig(size=size)).board


def _unique_solution(board: Board) -> set[int]:
    solutions = list(iter_solutions(board))
    assert len(solutions) == 1, "generator gate must guarantee uniqueness"
    return set(solutions[0])


@settings(max_examples=25, deadline=None)
@given(SEEDS, SIZE_ST)
def test_deduce_finds_the_unique_solution(seed: int, size: int) -> None:
    board = _board(size, seed)
    solution = _unique_solution(board)
    trace = deduce(board)
    assert trace.solved
    assert set(trace.solution or ()) == solution
    assert not trace.exhausted


@settings(max_examples=25, deadline=None)
@given(SEEDS, SIZE_ST)
def test_pure_rules_are_sound(seed: int, size: int) -> None:
    """Pure-deduction placements and eliminations must be solver facts."""
    board = _board(size, seed)
    solution = _unique_solution(board)
    trace = deduce(board, allow_guesses=False)
    for step in trace.steps:
        assert set(step.cells).isdisjoint(solution)
        if step.queen is not None:
            assert step.queen in solution


def test_deduce_is_deterministic() -> None:
    board = _board(8, 987)
    first = deduce(board)
    second = deduce(board)
    assert first.steps == second.steps
    assert first.solution == second.solution
    assert first.guesses == second.guesses
    assert first.rounds == second.rounds


def test_rule_anchor_intersection_and_subset() -> None:
    """seed 0 at size 5 leans on an intersection and a subset in pure logic."""
    board = _board(5, 0)
    counts = deduce(board, allow_guesses=False).rule_counts
    assert counts.get(INTERSECTION, 0) >= 1
    assert counts.get(SUBSET, 0) >= 1


def test_rule_anchor_trial() -> None:
    """seed 6 at size 5 stalls on pure logic and needs exactly one probe."""
    board = _board(5, 6)
    pure = deduce(board, allow_guesses=False)
    assert not pure.solved
    assert pure.needs_guessing

    full = deduce(board)
    assert full.solved
    assert full.rule_counts.get(TRIAL, 0) == 1
    assert full.guesses == 1


def test_no_guesses_mask_never_tries() -> None:
    board = _board(5, 6)
    trace = deduce(board, allow_guesses=False)
    assert all(step.rule != TRIAL for step in trace.steps)
    assert trace.guesses == 0


def test_deduce_rejects_star_battle() -> None:
    board = Board(
        size=4,
        regions=(0, 0, 1, 1, 0, 0, 1, 1, 2, 2, 3, 3, 2, 2, 3, 3),
        region_capacity=(2, 2, 2, 2),
        puzzle_type=PuzzleType.STAR_BATTLE,
    )
    try:
        deduce(board)
    except DeductionError:
        pass
    else:
        raise AssertionError("expected DeductionError for a star-battle board")


def test_deduce_rejects_bad_guess_cap() -> None:
    board = _board(5, 0)
    for bad in (0, -3):
        try:
            deduce(board, guess_cap=bad)
        except DeductionError:
            pass
        else:
            raise AssertionError(f"guess_cap {bad} should be rejected")


def test_score_difficulty_is_deterministic() -> None:
    board = _board(7, 31337)
    a = score_difficulty(board)
    b = score_difficulty(board)
    assert a == b
    assert a.score == b.score


def test_score_difficulty_matches_trace() -> None:
    board = _board(7, 31337)
    difficulty = score_difficulty(board)
    trace = deduce(board)
    expected = sum(trace.rule_counts.get(rule, 0) * weight for rule, weight in RULE_WEIGHTS.items())
    assert difficulty.score == expected + trace.guesses * 0.5
    assert difficulty.steps == len(trace.steps)
    assert difficulty.rounds == trace.rounds
    assert difficulty.guesses == trace.guesses
    assert difficulty.needs_guessing is trace.needs_guessing
    assert difficulty.rule_counts == trace.rule_counts


def test_score_difficulty_levels() -> None:
    assert score_difficulty(_board(5, 0)).level_name == "Easy"
    assert score_difficulty(_board(5, 6)).needs_guessing is True
    for size in SIZES:
        for seed in (1, 2, 3):
            level = score_difficulty(_board(size, seed)).level
            assert 1 <= level <= 5


def test_generated_boards_stay_within_guess_budget() -> None:
    for size in SIZES:
        for seed in range(8):
            trace = deduce(_board(size, seed))
            assert trace.solved
            assert trace.guesses < DEFAULT_GUESS_CAP
            assert not trace.exhausted


def test_difficulty_builds_from_seed_anchor() -> None:
    difficulty: Difficulty = score_difficulty(_board(5, 6))
    assert difficulty.score == 25.5
    assert difficulty.level_name == "Medium"
