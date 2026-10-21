"""Independent Sudoku rules and bounded exact counting."""

import pytest

from queens_engine.sudoku import SudokuGrid, SudokuSearchLimitError, is_solution, solve

SOLUTION = tuple((r * 3 + r // 3 + c) % 9 + 1 for r in range(9) for c in range(9))


def test_direct_rules_and_immutable_givens() -> None:
    grid = SudokuGrid(SOLUTION)
    assert is_solution(grid, SOLUTION)
    assert not is_solution(grid, (0,) * 81)
    assert not is_solution(grid, SOLUTION[::-1])
    assert not is_solution(SudokuGrid((0,) * 81), tuple(r + 1 for r in range(9) for _ in range(9)))


@pytest.mark.parametrize(
    "cells", [(0,) * 80, (0,) * 82, (True,) + (0,) * 80, (1.5,) + (0,) * 80, (10,) + (0,) * 80]
)
def test_rejects_invalid_values(cells: tuple[object, ...]) -> None:
    with pytest.raises(ValueError):
        SudokuGrid(cells)  # type: ignore[arg-type]


@pytest.mark.parametrize("other", [1, 9, 10])
def test_rejects_duplicate_givens(other: int) -> None:
    cells = [0] * 81
    cells[0] = cells[other] = 1
    with pytest.raises(ValueError):
        SudokuGrid(tuple(cells))


def test_distinguishes_zero_one_multiple_and_budget_exhaustion() -> None:
    assert solve(SudokuGrid((0, *SOLUTION[1:]))).solutions == (SOLUTION,)
    impossible = tuple(range(1, 9)) + (0,) * 9 + (9,) + (0,) * 63
    assert solve(SudokuGrid(impossible)).solutions == ()
    empty = SudokuGrid((0,) * 81)
    assert len(solve(empty).solutions) == 2
    with pytest.raises(SudokuSearchLimitError):
        solve(empty, max_nodes=0)
    # The first completion uses 81 placements; a second cannot fit in this budget.
    with pytest.raises(SudokuSearchLimitError):
        solve(empty, max_nodes=81)
