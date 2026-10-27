"""Certify generated Killer Sudoku against the independent preview solver."""

import importlib.util
from collections.abc import Callable
from pathlib import Path
from typing import cast

import pytest

from queens_engine.killer_sudoku import Cage, KillerGrid, solve
from queens_engine.killer_sudoku_gen import deduce, generate
from queens_engine.sudoku import Level, SudokuSearchLimitError

spec = importlib.util.spec_from_file_location(
    "killer_preview_oracle",
    Path(__file__).resolve().parents[2] / "app/scripts/verify_killer_previews.py",
)
assert spec and spec.loader
oracle = importlib.util.module_from_spec(spec)
spec.loader.exec_module(oracle)
independent_solve = cast(
    "Callable[[list[list[int]], list[int], list[int]], tuple[list[list[int]], int, bool]]",
    oracle.solve,
)


@pytest.mark.parametrize("level", ["easy", "medium", "hard"])
def test_generated_board_is_unique_and_solved_by_supported_logic(level: Level) -> None:
    accepted, grid = generate(100, level)
    assert generate(accepted, level, max_attempts=1) == (accepted, grid)
    result = solve(grid)
    independent, _, exhausted = independent_solve(
        [list(c.cells) for c in grid.cages], [c.total for c in grid.cages], list(grid.givens)
    )
    assert not exhausted
    assert independent == [list(result.solutions[0])]
    assert deduce(grid).cells == result.solutions[0]


def test_search_limit_is_not_a_uniqueness_certificate():
    _, grid = generate(100, "easy")
    with pytest.raises(SudokuSearchLimitError):
        solve(grid, max_nodes=0)


def test_overlapping_or_disconnected_cages_rejected():
    _, grid = generate(100, "easy")
    with pytest.raises(ValueError):
        KillerGrid(grid.givens, (Cage(3, (0, 2)), *grid.cages), grid.level)
