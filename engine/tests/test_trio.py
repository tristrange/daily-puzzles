"""Behavioural contract for the frozen Trio rules and independent exact search."""

from __future__ import annotations

import pytest
from tools.trio_probe import check_trace

from queens_engine.trio import (
    Relation,
    TrioContradictionError,
    TrioGrid,
    TrioSearchLimitError,
    count_solutions,
    deduce,
    is_solution,
    solve,
)

# Balanced rows/columns, with repeats allowed and no three consecutive equals.
SOLUTION = tuple((row + col) % 3 + 1 for row in range(9) for col in range(9))


def test_completion_checks_each_symbol_counts_givens_and_relations() -> None:
    grid = TrioGrid(SOLUTION, (Relation(0, 1, "different"),))
    assert is_solution(grid, SOLUTION)
    assert not is_solution(grid, (0,) * 81)
    assert not is_solution(grid, tuple(2 if v == 1 else v for v in SOLUTION))
    assert not is_solution(TrioGrid((0,) * 81, (Relation(0, 1, "same"),)), SOLUTION)


@pytest.mark.parametrize("pair", [(8, 9), (0, 10)])
def test_relations_cannot_wrap_rows_or_run_diagonally(pair: tuple[int, int]) -> None:
    with pytest.raises(ValueError, match="adjacent"):
        Relation(*pair, "same")


def test_exact_counter_distinguishes_zero_one_and_multiple_solutions() -> None:
    assert solve(TrioGrid(SOLUTION)).solutions == (SOLUTION,)
    assert count_solutions(TrioGrid(SOLUTION)) == 1
    ambiguous = tuple(v if v == 3 else 0 for v in SOLUTION)
    assert len(solve(TrioGrid(ambiguous)).solutions) == 2
    assert count_solutions(TrioGrid(ambiguous)) == 2
    assert count_solutions(TrioGrid(ambiguous), limit=1) == 1
    contradictory = (1, 1, 1, *SOLUTION[3:])
    assert solve(TrioGrid(contradictory)).solutions == ()
    assert count_solutions(TrioGrid(contradictory)) == 0
    with pytest.raises(ValueError, match="positive"):
        count_solutions(TrioGrid(SOLUTION), limit=0)


def test_completion_preserves_givens_and_allows_repeated_rows_and_diagonal_runs() -> None:
    swapped = tuple(3 - v if v < 3 else v for v in SOLUTION)
    assert is_solution(TrioGrid((0,) * 81), swapped)
    assert not is_solution(TrioGrid(SOLUTION), swapped)
    diagonal = tuple((r - c) % 3 + 1 for r in range(9) for c in range(9))
    assert is_solution(TrioGrid((0,) * 81), diagonal)
    triples = tuple(((c + r) % 9) // 3 + 1 for r in range(9) for c in range(9))
    assert not is_solution(TrioGrid((0,) * 81), triples)


def test_malformed_givens_and_duplicate_relations_are_rejected() -> None:
    with pytest.raises(ValueError, match="81 integers"):
        TrioGrid((True, *SOLUTION[1:]))
    with pytest.raises(ValueError, match="81 integers"):
        TrioGrid(SOLUTION[:-1])
    with pytest.raises(ValueError, match="only one relation"):
        TrioGrid(SOLUTION, (Relation(0, 1, "same"), Relation(0, 1, "different")))


def test_search_exhaustion_is_explicit_not_a_uniqueness_result() -> None:
    with pytest.raises(TrioSearchLimitError):
        solve(TrioGrid((0,) * 81), max_attempts=0)


def test_inequality_leaves_two_candidates_and_logic_can_stall() -> None:
    grid = TrioGrid((1, *(0,) * 80), (Relation(0, 1, "different"),))
    result = deduce(grid)
    assert result.candidates[1] == 0b110
    assert not result.solved
    assert result.cells[1] == 0
    assert result.steps[0].rule == "different"


def test_no_three_removes_a_symbol_from_a_gap_vertically_and_horizontally() -> None:
    for pair, gap in [((0, 2), 1), ((0, 18), 9)]:
        givens = [0] * 81
        for cell in pair:
            givens[cell] = 1
        result = deduce(TrioGrid(tuple(givens)))
        assert result.candidates[gap] == 0b110
        assert any(step.cell == gap and step.rule == "no-three" for step in result.steps)


def test_counting_and_equal_clues_propagate_without_guessing() -> None:
    givens = [0] * 81
    for cell in (0, 3, 6):
        givens[cell] = 1
    result = deduce(TrioGrid(tuple(givens), (Relation(6, 15, "same"),)))
    assert result.candidates[1] == 0b110
    assert result.cells[15] == 1
    missing = (0, *SOLUTION[1:])
    completed = deduce(TrioGrid(missing))
    assert completed.solved
    assert completed.cells == SOLUTION


def test_conflicting_relations_have_no_solution_and_no_deduction_success() -> None:
    grid = TrioGrid((1, 1, *(0,) * 79), (Relation(0, 1, "different"),))
    assert solve(TrioGrid(SOLUTION, (Relation(0, 1, "same"),))).solutions == ()
    with pytest.raises(TrioContradictionError):
        deduce(grid)


def test_probe_checks_each_eliminated_alternative_against_exact_search() -> None:
    # The one empty cell is a sun: moon and star must both be independently rejected.
    assert check_trace(TrioGrid((0, *SOLUTION[1:]))) == 2
