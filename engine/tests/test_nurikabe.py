from dataclasses import FrozenInstanceError
from itertools import product

import pytest

from queens_engine.nurikabe import (
    LAND,
    SEA,
    NurikabeGrid,
    NurikabeSearchLimitError,
    is_solution,
    solve,
)

FIVE_CLUES = tuple(
    value
    for row in (
        (1, 0, 0, 2, 0),
        (0, 1, 0, 0, 0),
        (0, 0, 0, 1, 0),
        (2, 0, 0, 0, 0),
        (0, 0, 0, 2, 0),
    )
    for value in row
)
FIVE_ANSWER = tuple(
    value
    for row in (
        (1, 0, 0, 1, 1),
        (0, 1, 0, 0, 0),
        (0, 0, 0, 1, 0),
        (1, 1, 0, 0, 0),
        (0, 0, 0, 1, 1),
    )
    for value in row
)


def _components(cells: set[tuple[int, int]]) -> list[set[tuple[int, int]]]:
    remaining = cells.copy()
    groups: list[set[tuple[int, int]]] = []
    while remaining:
        group = {remaining.pop()}
        pending = list(group)
        while pending:
            row, col = pending.pop()
            for adjacent in ((row - 1, col), (row + 1, col), (row, col - 1), (row, col + 1)):
                if adjacent in remaining:
                    remaining.remove(adjacent)
                    group.add(adjacent)
                    pending.append(adjacent)
        groups.append(group)
    return groups


def _oracle_valid(size: int, clues: tuple[int, ...], cells: tuple[int, ...]) -> bool:
    white = {(r, c) for r in range(size) for c in range(size) if cells[r * size + c] == 1}
    black = {(r, c) for r in range(size) for c in range(size)} - white
    if any(clues[r * size + c] and (r, c) not in white for r in range(size) for c in range(size)):
        return False
    for island in _components(white):
        numbers = [clues[r * size + c] for r, c in island if clues[r * size + c]]
        if numbers != [len(island)]:
            return False
    return len(_components(black)) == 1 and not any(
        {(r, c), (r + 1, c), (r, c + 1), (r + 1, c + 1)} <= black
        for r in range(size - 1)
        for c in range(size - 1)
    )


def _oracle_answers(size: int, clues: tuple[int, ...]) -> set[tuple[int, ...]]:
    return {cells for cells in product((0, 1), repeat=size**2) if _oracle_valid(size, clues, cells)}


def test_all_two_by_two_clue_assignments_match_an_independent_oracle() -> None:
    for clues in product(range(5), repeat=4):
        if not any(clues):
            continue
        grid = NurikabeGrid(2, clues)
        expected = _oracle_answers(2, clues)
        actual = solve(grid).solutions
        assert len(actual) == min(2, len(expected)), clues
        assert len(set(actual)) == len(actual), clues
        assert set(actual) <= expected, clues
        for cells in product((0, 1), repeat=4):
            assert is_solution(grid, cells) == (cells in expected), (clues, cells)


@pytest.mark.parametrize(
    "clues",
    [
        (1, 0, 1, 0, 0, 0, 1, 0, 1),
        (0, 0, 0, 0, 3, 0, 0, 0, 0),
        (0, 0, 0, 0, 8, 0, 0, 0, 0),
        (2, 0, 0, 0, 0, 0, 0, 0, 2),
        (2, 2, 0, 0, 0, 0, 0, 0, 0),
        (1, 0, 1, 0, 1, 0, 1, 0, 1),
    ],
)
def test_three_by_three_counts_and_complete_rules_match_oracle(clues: tuple[int, ...]) -> None:
    grid = NurikabeGrid(3, clues)
    expected = _oracle_answers(3, clues)
    result = solve(grid)
    assert len(result.solutions) == min(2, len(expected))
    assert len(set(result.solutions)) == len(result.solutions)
    assert set(result.solutions) <= expected
    for cells in product((0, 1), repeat=9):
        assert is_solution(grid, cells) == (cells in expected)


def test_original_five_by_five_has_one_answer_and_allows_diagonal_islands() -> None:
    grid = NurikabeGrid(5, FIVE_CLUES)
    assert _oracle_valid(5, FIVE_CLUES, FIVE_ANSWER)
    assert is_solution(grid, FIVE_ANSWER)
    assert solve(grid).solutions == (FIVE_ANSWER,)


@pytest.mark.parametrize(
    ("size", "clues", "cells"),
    [
        pytest.param(2, (1, 0, 0, 0), (0, 1, 0, 0), id="numbered-cell-is-sea"),
        pytest.param(2, (1, 1, 0, 0), (1, 1, 0, 0), id="two-clues-in-one-island"),
        pytest.param(2, (2, 0, 0, 0), (1, 0, 0, 0), id="wrong-island-size"),
        pytest.param(
            3, (1, 0, 0, 0, 0, 0, 0, 0, 0), (1, 0, 0, 0, 0, 0, 0, 0, 1), id="orphan-island"
        ),
        pytest.param(2, (1, 0, 0, 1), (1, 0, 0, 1), id="disconnected-sea"),
        pytest.param(3, (1, 0, 0, 0, 0, 0, 0, 0, 0), (1, 0, 0, 0, 0, 0, 0, 0, 0), id="sea-square"),
        pytest.param(2, (4, 0, 0, 0), (1, 1, 1, 1), id="empty-sea"),
    ],
)
def test_rejects_each_broken_rule(
    size: int, clues: tuple[int, ...], cells: tuple[int, ...]
) -> None:
    assert not is_solution(NurikabeGrid(size, clues), cells)


@pytest.mark.parametrize(
    "cells",
    [(1, 0, 0), (1, 0, 0, 0, 0), (True, 0, 0, 0), (1.0, 0, 0, 0), (1, 0, 0, -1), (1, 0, 0, 2)],
)
def test_unknown_or_noninteger_marks_are_not_complete_solutions(cells: tuple[object, ...]) -> None:
    assert not is_solution(NurikabeGrid(2, (1, 0, 0, 0)), cells)  # type: ignore[arg-type]


@pytest.mark.parametrize("size", [True, 2.0, 1, 11, -1])
def test_rejects_invalid_dimensions(size: object) -> None:
    with pytest.raises(ValueError):
        NurikabeGrid(size, (1, 0, 0, 0))  # type: ignore[arg-type]


@pytest.mark.parametrize(
    "clues",
    [
        (0, 0, 0, 0),
        (1, 0, 0),
        (1, 0, 0, 0, 0),
        (True, 0, 0, 0),
        (1.0, 0, 0, 0),
        (-1, 0, 0, 0),
        (5, 0, 0, 0),
    ],
)
def test_rejects_malformed_clues(clues: tuple[object, ...]) -> None:
    with pytest.raises(ValueError):
        NurikabeGrid(2, clues)  # type: ignore[arg-type]


def test_grid_and_answers_are_immutable_and_search_is_deterministic() -> None:
    clues = [2, 0, 0, 0]
    grid = NurikabeGrid(2, clues)  # type: ignore[arg-type]
    clues[0] = 1
    assert grid.clues == (2, 0, 0, 0)
    assert NurikabeGrid(10, (1,) + (0,) * 99).size == 10
    with pytest.raises(FrozenInstanceError):
        grid.size = 3  # type: ignore[misc]
    result = solve(grid)
    assert result == solve(grid)
    assert result.solutions == ((LAND, LAND, SEA, SEA), (LAND, SEA, LAND, SEA))
    with pytest.raises(FrozenInstanceError):
        result.nodes = 0  # type: ignore[misc]


@pytest.mark.parametrize("budget", [True, 1.0, -1])
def test_rejects_invalid_budgets(budget: object) -> None:
    with pytest.raises(ValueError):
        solve(NurikabeGrid(2, (1, 0, 0, 0)), max_nodes=budget)  # type: ignore[arg-type]


def test_zero_budget_is_inconclusive_even_for_an_impossible_board() -> None:
    with pytest.raises(NurikabeSearchLimitError):
        solve(NurikabeGrid(2, (4, 0, 0, 0)), max_nodes=0)
    assert solve(NurikabeGrid(2, (4, 0, 0, 0)), max_nodes=1).solutions == ()


@pytest.mark.parametrize("budget", [0, 1, 2, 4])
def test_exhaustion_during_enumeration_or_combination_never_returns_partial_answers(
    budget: int,
) -> None:
    grid = NurikabeGrid(2, (2, 0, 0, 0))
    with pytest.raises(NurikabeSearchLimitError):
        solve(grid, max_nodes=budget)
    result = solve(grid, max_nodes=6)
    assert result.nodes == 6
    assert len(result.solutions) == 2


def test_exhaustion_after_one_answer_is_inconclusive(monkeypatch: pytest.MonkeyPatch) -> None:
    accepted: list[tuple[int, ...]] = []

    def observe(grid: NurikabeGrid, cells: tuple[int, ...]) -> bool:
        valid = is_solution(grid, cells)
        if valid:
            accepted.append(cells)
        return valid

    monkeypatch.setattr("queens_engine.nurikabe.is_solution", observe)
    with pytest.raises(NurikabeSearchLimitError):
        solve(NurikabeGrid(2, (2, 0, 0, 0)), max_nodes=5)
    assert len(accepted) == 1
