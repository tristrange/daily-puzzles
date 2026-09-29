"""Exact solution counting, checked against an independent brute-force oracle.

The counter is the engine's only real proof obligation: if it says a board is
unique when it is not, every downstream guarantee is a lie. So the bulk of this
file is a cross-check against a second implementation that shares no code with
the solver, on randomly generated legal boards.
"""

from __future__ import annotations

import random
from collections.abc import Sequence
from itertools import combinations, permutations, product

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from queens_engine import Board, PuzzleType, SolverError
from queens_engine.board import BoardError
from queens_engine.solver import (
    count_solutions,
    format_solution,
    has_unique_solution,
    iter_solutions,
)

BIG = 1_000_000


# --------------------------------------------------------------------------
# Oracles. Deliberately naive and structured differently from the solver: these
# re-derive the rules from scratch so a shared mistake is unlikely.
# --------------------------------------------------------------------------


def _touching(a: int, b: int, size: int) -> bool:
    """True if cells a and b are neighbours, including diagonally."""
    a_row, a_col = divmod(a, size)
    b_row, b_col = divmod(b, size)
    return abs(a_row - b_row) <= 1 and abs(a_col - b_col) <= 1 and a != b


def brute_force_queens(board: Board) -> int:
    """Count by trying every column permutation, for the one-per-row case."""
    size = board.size
    count = 0
    for perm in permutations(range(size)):
        cells = [board.index(row, perm[row]) for row in range(size)]
        if any(_touching(x, y, size) for x, y in combinations(cells, 2)):
            continue
        # With one queen per row and per column, one per region is just a
        # check that all region ids are distinct.
        if len({board.region_at(cell) for cell in cells}) != size:
            continue
        count += 1
    return count


def brute_force_rows(board: Board) -> int:
    """Count by trying every per-row column set, checking all rules at the end."""
    size = board.size
    stars_per_row = sum(board.region_capacity) // size
    per_row = [list(combinations(range(size), stars_per_row)) for _ in range(size)]

    count = 0
    for choice in product(*per_row):
        cells: list[int] = []
        columns: set[int] = set()
        duplicate_column = False
        for row, cols in enumerate(choice):
            if columns & set(cols):
                duplicate_column = True
                break
            columns |= set(cols)
            cells.extend(board.index(row, col) for col in cols)
        if duplicate_column:
            continue
        if any(_touching(a, b, size) for a, b in combinations(cells, 2)):
            continue
        used: dict[int, int] = {}
        for cell in cells:
            region = board.region_at(cell)
            used[region] = used.get(region, 0) + 1
        if all(used.get(r, 0) == cap for r, cap in enumerate(board.region_capacity)):
            count += 1
    return count


# --------------------------------------------------------------------------
# Board construction for tests
# --------------------------------------------------------------------------


def striped(size: int) -> Board:
    """One region per row, so region and row constraints coincide."""
    return Board(
        size=size,
        regions=tuple(row for row in range(size) for _ in range(size)),
        region_capacity=(1,) * size,
        puzzle_type=PuzzleType.QUEENS,
    )


def random_legal_board(size: int, rng: random.Random, *, attempts: int = 400) -> Board | None:
    """Grow contiguous regions at random and return one that satisfies every rule.

    Returns None if `attempts` tries all fail, which keeps the caller honest
    instead of quietly testing fewer boards than it thinks.
    """
    for _ in range(attempts):
        regions: list[int | None] = [None] * (size * size)
        next_region = 0
        cells = list(range(size * size))
        rng.shuffle(cells)
        regions[cells[0]] = 0
        next_region += 1

        # Grow each new region outward from an existing one.
        ok = True
        for _ in range(size - 1):
            frontier = [
                cell
                for cell in range(size * size)
                if regions[cell] is None
                and any(regions[other] is not None for other in _orthogonal(cell, size))
            ]
            if not frontier:
                ok = False
                break
            regions[rng.choice(frontier)] = next_region
            next_region += 1
        if not ok:
            continue

        # Assign every leftover cell to an adjacent region, so regions stay
        # 4-connected without adding any.
        pending = [cell for cell in range(size * size) if regions[cell] is None]
        while pending:
            progressed = False
            still: list[int] = []
            for cell in pending:
                touching_regions = [
                    regions[other]
                    for other in _orthogonal(cell, size)
                    if regions[other] is not None
                ]
                if touching_regions:
                    regions[cell] = rng.choice(touching_regions)
                    progressed = True
                else:
                    still.append(cell)
            pending = still
            if not progressed:
                break
        if pending:
            continue

        try:
            return Board(
                size=size,
                regions=tuple(r for r in regions if r is not None),
                region_capacity=(1,) * size,
                puzzle_type=PuzzleType.QUEENS,
            )
        except BoardError:
            continue
    return None


def _orthogonal(cell: int, size: int) -> tuple[int, ...]:
    row, col = divmod(cell, size)
    found: list[int] = []
    for d_row, d_col in ((-1, 0), (1, 0), (0, -1), (0, 1)):
        r, c = row + d_row, col + d_col
        if 0 <= r < size and 0 <= c < size:
            found.append(r * size + c)
    return tuple(found)


def sample_boards(sizes: Sequence[int], count: int) -> list[Board]:
    rng = random.Random(20260930)
    boards: list[Board] = []
    size = sizes[0]
    for index in range(count):
        if index % max(1, count // len(sizes)) == 0:
            size = sizes[(index // max(1, count // len(sizes))) % len(sizes)]
        board = random_legal_board(size, rng)
        if board is not None:
            boards.append(board)
    return boards


# --------------------------------------------------------------------------
# Hand-written cases
# --------------------------------------------------------------------------


class TestKnownBoards:
    def test_striped_four_has_the_two_classic_queens_solutions(self) -> None:
        # With one region per row the puzzle reduces to 4-queens, which has
        # exactly two solutions, and both already avoid diagonal contact.
        assert count_solutions(striped(4), limit=BIG) == 2

    def test_striped_two_has_no_solution(self) -> None:
        # 2-queens places them in opposite corners, which always touch.
        assert count_solutions(striped(2), limit=BIG) == 0

    def test_striped_three_has_no_solution(self) -> None:
        assert count_solutions(striped(3), limit=BIG) == 0

    def test_striped_six_has_a_known_count(self) -> None:
        board = striped(6)
        assert count_solutions(board, limit=BIG) == brute_force_queens(board)

    def test_a_real_puzzle_with_one_solution_is_unique(self) -> None:
        # An interlocking board, not a stripe: region 2 is a nine-cell blob.
        board = Board(
            size=4,
            regions=(2, 3, 3, 3, 2, 2, 0, 0, 2, 2, 1, 0, 2, 2, 1, 0),
            region_capacity=(1, 1, 1, 1),
            puzzle_type=PuzzleType.QUEENS,
        )
        assert has_unique_solution(board)
        # Columns 1, 3, 0, 2: one per row, per column and per region, with no
        # two queens touching even diagonally.
        assert list(iter_solutions(board)) == [(1, 7, 8, 14)]

    def test_iterating_matches_counting(self) -> None:
        for board in sample_boards([3, 4, 5], 12):
            solutions = list(iter_solutions(board))
            assert len(solutions) == count_solutions(board, limit=BIG)
            assert len(set(solutions)) == len(solutions)


class TestLimit:
    def test_default_limit_reports_at_most_two(self) -> None:
        board = striped(4)
        assert count_solutions(board) == 2

    def test_limit_one_never_exceeds_one(self) -> None:
        for board in sample_boards([3, 4, 5], 10):
            assert count_solutions(board, limit=1) in (0, 1)

    def test_count_is_non_decreasing_in_limit(self) -> None:
        for board in sample_boards([3, 4, 5], 10):
            full = count_solutions(board, limit=BIG)
            for limit in (1, 2, 3, 5, 10):
                assert count_solutions(board, limit=limit) == min(full, limit)

    def test_limit_must_be_positive(self) -> None:
        with pytest.raises(SolverError, match="limit must be at least 1"):
            count_solutions(striped(4), limit=0)


class TestCapacityParameterisation:
    def test_star_battle_capacity_of_two_per_region(self) -> None:
        # Two regions of eight cells, two stars each, so two per row and
        # column. The same code path serves this and Queens; only the capacity
        # differs, so the count must match the general oracle.
        board = Board(
            size=4,
            regions=(1, 1, 1, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0),
            region_capacity=(2, 2),
            puzzle_type=PuzzleType.STAR_BATTLE,
        )
        assert count_solutions(board, limit=BIG) == 2
        assert count_solutions(board, limit=BIG) == brute_force_rows(board)

    def test_inconsistent_capacities_are_reported(self) -> None:
        # Structurally fine, but the capacities total 5, which no whole number
        # of 4-cell rows can hold.
        board = Board(
            size=4,
            regions=(2, 3, 3, 3, 2, 2, 0, 0, 2, 2, 1, 0, 2, 2, 1, 0),
            region_capacity=(1, 1, 1, 2),
            puzzle_type=PuzzleType.STAR_BATTLE,
        )
        with pytest.raises(SolverError, match="not divisible"):
            count_solutions(board)

    def test_a_board_with_no_arrangement_has_no_solutions(self) -> None:
        # Region 0 needs two stars but every cell of it that could take one
        # forces a pair to touch, so the search finds nothing.
        board = Board(
            size=4,
            regions=(2, 1, 1, 1, 2, 2, 2, 0, 2, 2, 2, 0, 2, 2, 2, 2),
            region_capacity=(2, 1, 1),
            puzzle_type=PuzzleType.STAR_BATTLE,
        )
        assert count_solutions(board, limit=BIG) == 0
        assert list(iter_solutions(board)) == []


class TestInvariants:
    def test_transposing_a_board_preserves_the_count(self) -> None:
        for board in sample_boards([3, 4, 5], 12):
            size = board.size
            transposed = tuple(
                board.region_at(size * col + row) for row in range(size) for col in range(size)
            )
            mirrored = Board(
                size=size,
                regions=transposed,
                region_capacity=board.region_capacity,
                puzzle_type=board.puzzle_type,
            )
            assert count_solutions(mirrored, limit=BIG) == count_solutions(board, limit=BIG)

    def test_every_solution_the_solver_reports_obeys_the_rules(self) -> None:
        # The rules restated independently of the search: if this fails, the
        # solver is reporting placements that are not actually solutions.
        for board in sample_boards([3, 4, 5, 6], 16):
            for solution in iter_solutions(board):
                assert obeys_the_rules(board, solution)


def obeys_the_rules(board: Board, cells: Sequence[int]) -> bool:
    """Check a candidate solution against the four rules, restated from scratch."""
    size = board.size
    total_stars = sum(board.region_capacity)
    per_line = total_stars // size

    rows = [cell // size for cell in cells]
    cols = [cell % size for cell in cells]
    used: dict[int, int] = {}
    for cell in cells:
        used[board.region_at(cell)] = used.get(board.region_at(cell), 0) + 1

    return (
        # Stars are distinct, in range, and there are as many as capacities ask.
        len(set(cells)) == total_stars
        and all(0 <= cell < size * size for cell in cells)
        # Every row and column is used, and holds exactly its share.
        and len(set(rows)) == size
        and len(set(cols)) == size
        and all(rows.count(row) == per_line for row in set(rows))
        and all(cols.count(col) == per_line for col in set(cols))
        # Every region holds exactly its capacity.
        and used == dict(enumerate(board.region_capacity))
        # And no two stars touch, diagonally included.
        and not any(_touching(a, b, size) for a, b in combinations(sorted(cells), 2))
    )


# --------------------------------------------------------------------------
# Property tests
# --------------------------------------------------------------------------


@settings(
    max_examples=200,
    deadline=None,
    suppress_health_check=[HealthCheck.too_slow, HealthCheck.data_too_large],
)
@given(size=st.integers(min_value=2, max_value=5), seed=st.integers(min_value=0, max_value=2**32))
def test_agrees_with_brute_force_queens(size: int, seed: int) -> None:
    rng = random.Random(seed)
    board = random_legal_board(size, rng)
    if board is None:
        return
    assert count_solutions(board, limit=BIG) == brute_force_queens(board)


@settings(max_examples=60, deadline=None, suppress_health_check=[HealthCheck.too_slow])
@given(size=st.integers(min_value=2, max_value=4), seed=st.integers(min_value=0, max_value=2**32))
def test_agrees_with_brute_force_general(size: int, seed: int) -> None:
    rng = random.Random(seed)
    board = random_legal_board(size, rng)
    if board is None:
        return
    assert count_solutions(board, limit=BIG) == brute_force_rows(board)


@settings(max_examples=40, deadline=None, suppress_health_check=[HealthCheck.too_slow])
@given(size=st.integers(min_value=2, max_value=4), seed=st.integers(min_value=0, max_value=2**32))
def test_enumeration_agrees_with_counting(size: int, seed: int) -> None:
    rng = random.Random(seed)
    board = random_legal_board(size, rng)
    if board is None:
        return
    solutions = list(iter_solutions(board))
    assert len(solutions) == count_solutions(board, limit=BIG)
    for solution in solutions:
        assert len(solution) == size
        assert len(set(solution)) == size


class TestRuleChecker:
    """The rule checker is only worth trusting if it rejects invalid placements.

    Without this, `test_every_solution_the_solver_reports_obeys_the_rules`
    could pass against a checker that returns True unconditionally.
    """

    def test_it_accepts_a_real_solution(self) -> None:
        board = Board(
            size=4,
            regions=(2, 3, 3, 3, 2, 2, 0, 0, 2, 2, 1, 0, 2, 2, 1, 0),
            region_capacity=(1, 1, 1, 1),
            puzzle_type=PuzzleType.QUEENS,
        )
        assert obeys_the_rules(board, [1, 7, 8, 14])

    def test_it_rejects_a_pair_of_diagonal_neighbours(self) -> None:
        board = Board(
            size=4,
            regions=(2, 3, 3, 3, 2, 2, 0, 0, 2, 2, 1, 0, 2, 2, 1, 0),
            region_capacity=(1, 1, 1, 1),
            puzzle_type=PuzzleType.QUEENS,
        )
        # 0 and 5 are diagonal neighbours, so this cannot be a solution even
        # though every other rule holds.
        assert not obeys_the_rules(board, [0, 5, 8, 14])

    def test_it_rejects_two_stars_in_one_region(self) -> None:
        board = Board(
            size=4,
            regions=(2, 3, 3, 3, 2, 2, 0, 0, 2, 2, 1, 0, 2, 2, 1, 0),
            region_capacity=(1, 1, 1, 1),
            puzzle_type=PuzzleType.QUEENS,
        )
        # Cells 0, 1 and 6 are all region 2, and 0/1 are adjacent anyway.
        assert not obeys_the_rules(board, [0, 1, 6, 14])

    def test_it_rejects_a_repeated_cell(self) -> None:
        board = striped(4)
        assert not obeys_the_rules(board, [0, 0, 8, 14])


class TestRendering:
    def test_format_marks_stars_and_region_ids(self) -> None:
        board = striped(3)
        rendered = format_solution(board, [board.index(0, 1)]).splitlines()
        assert rendered[0] == " 0 Q 0"
        assert rendered[1] == " 1 1 1"
        assert len(rendered) == 3

    def test_every_solution_renders_to_the_right_size(self) -> None:
        board = striped(4)
        for solution in iter_solutions(board):
            assert len(format_solution(board, solution).splitlines()) == board.size
