from itertools import combinations

import pytest

from queens_engine.enclosure import EnclosureGrid, evaluate, exhaustive_optimum
from queens_engine.enclosure_solver import (
    EnclosureSolverTimeoutError,
    InconclusiveResult,
    InfeasibleResult,
    OptimalResult,
    solve_optimal,
)


def test_exact_solver_matches_exhaustive_small_terrain_boards() -> None:
    for count in range(3):
        for water in combinations((0, 1, 2, 3, 5, 6, 7, 8), count):
            for budget in (0, 2, 4):
                grid = EnclosureGrid(3, water, 4, budget)
                oracle = exhaustive_optimum(grid)
                result = solve_optimal(grid)
                if oracle.score is None:
                    assert isinstance(result, InfeasibleResult)
                else:
                    assert isinstance(result, OptimalResult)
                    assert result.score == result.best_bound == oracle.score
                    checked = evaluate(grid, result.walls)
                    assert not checked.escaped
                    assert checked.score == result.score


def test_disconnected_water_pockets_do_not_inflate_optimum() -> None:
    water = (2, 7, 10, 11, 12, 13, 14, 17, 22)
    grid = EnclosureGrid(5, water, 6, 2)
    result = solve_optimal(grid)
    oracle = exhaustive_optimum(grid)
    assert isinstance(result, OptimalResult)
    assert result.score == oracle.score == 1


def test_boundary_horse_cannot_be_enclosed() -> None:
    result = solve_optimal(EnclosureGrid(3, (), 0, 8))
    assert isinstance(result, InfeasibleResult)


def test_water_ring_requires_no_walls_and_includes_the_horse() -> None:
    result = solve_optimal(EnclosureGrid(3, (1, 3, 5, 7), 4, 0))
    assert isinstance(result, OptimalResult)
    assert result.score == 1
    assert result.walls == ()


def test_zero_search_budget_is_inconclusive_and_not_a_claim_of_optimality() -> None:
    result = solve_optimal(EnclosureGrid(8, (), 27, 10), max_deterministic_time=0)
    assert isinstance(result, InconclusiveResult)


def test_safety_timeout_aborts_instead_of_selecting_a_different_board() -> None:
    with pytest.raises(EnclosureSolverTimeoutError):
        solve_optimal(EnclosureGrid(8, (), 27, 10), max_time_seconds=0.000001)


@pytest.mark.parametrize("limit", [-1, float("nan"), float("inf")])
def test_search_limits_must_be_finite_and_nonnegative(limit: float) -> None:
    with pytest.raises(ValueError, match="limit"):
        solve_optimal(EnclosureGrid(3, (), 4, 4), max_deterministic_time=limit)
