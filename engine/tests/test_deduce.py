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
    FILL,
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


def _star_board(size: int, seed: int) -> Board:
    return generate_puzzle(
        seed=seed,
        puzzle_id="star",
        config=GenerationConfig(size=size, puzzle_type=PuzzleType.STAR_BATTLE, stars_per_row=2),
    ).board


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


def test_deduce_solves_a_star_battle_board() -> None:
    """The count model reaches k = 2: two stars per row, column and region.

    The engine used to refuse a star board outright. It now reads the capacities
    off the board, so the same rules carry a one-star and a two-star group.
    """
    board = _star_board(8, 3)
    solution = _unique_solution(board)
    trace = deduce(board)
    assert trace.solved
    assert set(trace.solution or ()) == solution
    assert not trace.exhausted


def test_pure_rules_are_sound_on_star_battle() -> None:
    """Same soundness contract as Queens, on a two-star board.

    Every placement and elimination is checked against the exact solver, so a
    rule that over-reaches at k = 2 — killing a cell the region or line still has
    room for, or placing a third star in a two-star group — fails here rather
    than in a player's hands.
    """
    board = _star_board(8, 3)
    solution = _unique_solution(board)
    trace = deduce(board, allow_guesses=False)
    for step in trace.steps:
        assert set(step.cells).isdisjoint(solution), f"{step.rule} killed a star"
        if step.queen is not None:
            assert step.queen in solution, f"{step.rule} placed a non-star"


def test_star_solutions_respect_the_no_touching_rule() -> None:
    """The no-touching rule includes the diagonals, for both puzzle types.

    The star path is where this could quietly change: `deduce` needed a
    per-type neighbourhood to support k > 1, and a four-neighbour version would
    still be *sound* — it would only be weaker. Nothing in a soundness test can
    tell a weaker rule from a correct one, so the rule is asserted directly.
    """
    board = _star_board(8, 3)
    solution = _unique_solution(board)
    for cell in solution:
        row, col = board.coords(cell)
        for d_row, d_col in ((0, 1), (1, 0), (1, 1), (1, -1)):
            near = (
                board.index(row + d_row, col + d_col)
                if (0 <= row + d_row < 8 and 0 <= col + d_col < 8)
                else None
            )
            assert near not in solution, f"star {cell} touches {near}"


def test_fill_cannot_fire_on_a_region_at_two_stars() -> None:
    """`fill` reaches a two-star board, but only ever through a row or column.

    A region of exactly two cells is a pair of orthogonally adjacent cells, and
    two stars in one region may not touch, so a two-cell region describes an
    illegal board and `Board` refuses it. A region therefore always keeps slack
    when the rules first look at it, and a naked pair can only ever be a row or a
    column that earlier eliminations reduced to two candidates.
    """
    for seed in (3, 11):
        board = _star_board(8, seed)
        assert board.stars_per_row == 2
        for region in range(board.region_count):
            cells = board.cells_of_region(region)
            assert len(cells) > 2, f"region {region} has no slack, which cannot be legal here"
            assert any(set(board.orthogonal_neighbours(a)) & set(cells) - {a} for a in cells), (
                f"region {region} is not connected, so `Board` should have refused it"
            )

    # And the rule it does reach, on the rare board that finishes without a guess.
    fired = any(
        step.rule == FILL
        for seed in range(60)
        for step in deduce(_star_board(8, seed), allow_guesses=False).steps
    )
    assert fired, "expected fill to be reachable at k = 2"


def test_deduce_is_deterministic_on_star_battle() -> None:
    board = _star_board(8, 11)
    first, second = deduce(board), deduce(board)
    assert first.steps == second.steps
    assert first.solution == second.solution


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
