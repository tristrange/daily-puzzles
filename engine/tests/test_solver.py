"""Exact solution counting, checked against an independent brute-force oracle.

The counter is the engine's only real proof obligation: if it says a board is
unique when it is not, every downstream guarantee is a lie. So the bulk of this
file is a cross-check against a second implementation that shares no code with
the solver, on randomly generated legal boards.
"""

from __future__ import annotations

import random
from collections.abc import Sequence
from functools import cache
from itertools import combinations, permutations

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


@cache
def _oracle_solve(
    board: Board,
    row: int,
    column_counts: tuple[int, ...],
    region_counts: tuple[int, ...],
    prev_cols: tuple[int, ...],
) -> int:
    """Count completions. Memoized so it stays an oracle rather than a hang.

    Deliberately shaped like the solver's own recursion but independently
    written: explicit per-column and per-region count tuples, adjacency
    compared against the previous row's columns, and all four rules checked
    when the last row is reached. The point is that a mistake in one is
    unlikely to be the same mistake in both.
    """
    if row == board.size:
        stars_per_row = sum(board.region_capacity) // board.size
        return int(
            all(count == stars_per_row for count in column_counts)
            and region_counts == tuple(board.region_capacity)
        )

    stars_per_row = sum(board.region_capacity) // board.size
    size = board.size
    total = 0
    for cols in combinations(range(size), stars_per_row):
        if any(column_counts[col] >= stars_per_row for col in cols):
            continue
        # Vertical and diagonal: no column within 1 of a star in the row above.
        if any(abs(col - prev) <= 1 for col in cols for prev in prev_cols):
            continue
        # Horizontal: two stars in this row must not be adjacent.
        if any(abs(a - b) <= 1 for a, b in combinations(cols, 2)):
            continue

        next_columns = list(column_counts)
        next_regions = list(region_counts)
        overflowed = False
        for col in cols:
            next_columns[col] += 1
            region = board.region_at(board.index(row, col))
            next_regions[region] += 1
            if next_regions[region] > board.region_capacity[region]:
                overflowed = True
                break
        if overflowed:
            continue

        total += _oracle_solve(board, row + 1, tuple(next_columns), tuple(next_regions), cols)
    return total


def oracle_count(board: Board) -> int:
    """The reference implementation the solver is checked against."""
    return _oracle_solve(
        board,
        0,
        (0,) * board.size,
        (0,) * board.region_count,
        (),
    )


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


def _grow_contiguous_regions(size: int, region_count: int, rng: random.Random) -> list[int] | None:
    """Fill the grid with `region_count` blobs, each grown from one seed cell.

    Growing cell by cell from an existing region is what guarantees
    4-connectivity, so the only structural rule left to get wrong is having
    enough room to start each new region.
    """
    regions: list[int | None] = [None] * (size * size)
    cells = list(range(size * size))
    rng.shuffle(cells)
    regions[cells[0]] = 0

    for next_region in range(1, region_count):
        frontier = [
            cell
            for cell in range(size * size)
            if regions[cell] is None
            and any(regions[o] is not None for o in _orthogonal(cell, size))
        ]
        if not frontier:
            return None
        regions[rng.choice(frontier)] = next_region

    # Absorb whatever is left, always from a cell touching an existing region.
    pending = [cell for cell in range(size * size) if regions[cell] is None]
    while pending:
        still: list[int] = []
        for cell in pending:
            adjacent = [regions[o] for o in _orthogonal(cell, size) if regions[o] is not None]
            if adjacent:
                regions[cell] = rng.choice(adjacent)
            else:
                still.append(cell)
        if len(still) == len(pending):
            return None
        pending = still

    return [r for r in regions if r is not None]


def _balanced_capacity(
    member_count: dict[int, int], size: int, stars_per_row: int
) -> tuple[int, ...] | None:
    """Capacities in proportion to area, adjusted to sum to `size * stars_per_row`."""
    total_stars = size * stars_per_row
    ideal = {r: count * stars_per_row / size for r, count in member_count.items()}
    capacity = [max(1, int(ideal[r])) for r in sorted(ideal)]

    deficit = total_stars - sum(capacity)
    step = 1 if deficit > 0 else -1
    order = sorted(range(size), key=lambda r: -ideal[r])
    while deficit != 0:
        moved = False
        for region in order:
            if deficit == 0:
                break
            target = capacity[region] + step
            if 1 <= target <= member_count[region]:
                capacity[region] = target
                deficit -= step
                moved = True
        if not moved:
            return None

    return tuple(capacity) if sum(capacity) == total_stars else None


def random_star_battle_board(
    size: int, stars_per_row: int, rng: random.Random, *, attempts: int = 400
) -> Board | None:
    """A legal Star Battle board with `stars_per_row` stars in every row."""
    for _ in range(attempts):
        regions = _grow_contiguous_regions(size, size, rng)
        if regions is None:
            continue

        member_count: dict[int, int] = {}
        for region in regions:
            member_count[region] = member_count.get(region, 0) + 1

        capacity = _balanced_capacity(member_count, size, stars_per_row)
        if capacity is None:
            continue

        try:
            return Board(
                size=size,
                regions=tuple(regions),
                region_capacity=capacity,
                puzzle_type=PuzzleType.STAR_BATTLE,
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


def one_region_board(size: int, stars_per_row: int) -> Board:
    """Every cell in one region, sized so each row needs `stars_per_row` stars.

    Isolates the row/column rules from the region rules, which makes it the
    sharpest available probe for a bug in column accounting.
    """
    return Board(
        size=size,
        regions=(0,) * (size * size),
        region_capacity=(size * stars_per_row,),
        puzzle_type=PuzzleType.STAR_BATTLE,
    )


class TestMultiStarPerRow:
    """Boards with more than one star per row.

    An earlier version tracked used columns as a boolean mask, so a column was
    blocked for good after its first star. That is correct for Queens, where a
    column holds exactly one, and silently wrong here: with two stars per row a
    column must be reusable, and the old search ran out of columns and reported
    every multi-star board as unsolvable.
    """

    def test_a_column_is_reused_when_it_has_room(self) -> None:
        # The smallest grid where two stars per row can satisfy the touching
        # rule at all. The old code answered 0.
        board = one_region_board(8, 2)
        assert count_solutions(board, limit=BIG) == 2
        assert len(list(iter_solutions(board))) == 2

    def test_every_solution_uses_each_column_the_right_number_of_times(self) -> None:
        board = one_region_board(8, 2)
        for solution in iter_solutions(board):
            columns = [cell % board.size for cell in solution]
            assert all(columns.count(col) == 2 for col in range(board.size))
            assert obeys_the_rules(board, solution)

    def test_agrees_with_the_oracle_across_stars_per_row(self) -> None:
        # A row of k non-touching stars forces the next row's stars clear of
        # them, so a grid needs roughly 3k-1 columns before k per row is
        # feasible at all. Both sides are checked on feasible boards (where the
        # count is large enough to catch an off-by-one) and infeasible ones
        # (where it must be exactly 0). The oracle is exhaustive and grows
        # quickly, so the range stops where it stops being cheap; the solver is
        # exercised at larger sizes by the tests above.
        for stars_per_row, sizes in ((2, range(2, 10)), (3, range(3, 12))):
            for size in sizes:
                board = one_region_board(size, stars_per_row)
                assert count_solutions(board, limit=BIG) == oracle_count(board)

    def test_three_stars_per_row_is_handled(self) -> None:
        board = one_region_board(12, 3)
        assert count_solutions(board, limit=BIG) > 0
        for solution in iter_solutions(board):
            columns = [cell % board.size for cell in solution]
            assert all(columns.count(col) == 3 for col in range(board.size))
            assert obeys_the_rules(board, solution)

    def test_the_solver_handles_sizes_the_oracle_cannot(self) -> None:
        # Where the exhaustive oracle gets expensive the solver still has to
        # hold up: every solution it reports must satisfy the rules restated
        # from scratch, which needs no second implementation to be trusted.
        board = one_region_board(16, 4)
        assert count_solutions(board, limit=2) == 2
        for solution in iter_solutions(board):
            columns = [cell % board.size for cell in solution]
            assert all(columns.count(col) == 4 for col in range(board.size))
            assert obeys_the_rules(board, solution)

    def test_queens_is_unaffected(self) -> None:
        # One star per row is the degenerate case where the packed column count
        # is a plain bitmask, so the Queens path must be untouched.
        board = one_region_board(8, 1)
        assert count_solutions(board, limit=BIG) == oracle_count(board)


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
        assert count_solutions(board, limit=BIG) == oracle_count(board)

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
@given(
    size=st.integers(min_value=2, max_value=4),
    seed=st.integers(min_value=0, max_value=2**32),
)
def test_agrees_with_brute_force_general(size: int, seed: int) -> None:
    rng = random.Random(seed)
    board = random_legal_board(size, rng)
    if board is None:
        return
    assert count_solutions(board, limit=BIG) == oracle_count(board)


@settings(max_examples=25, deadline=None, suppress_health_check=[HealthCheck.too_slow])
@given(
    size=st.integers(min_value=8, max_value=10),
    seed=st.integers(min_value=0, max_value=2**32),
)
def test_agrees_with_oracle_when_several_stars_per_row(size: int, seed: int) -> None:
    board = one_region_board(size, 2)
    assert count_solutions(board, limit=BIG) == oracle_count(board)


@settings(max_examples=40, deadline=None, suppress_health_check=[HealthCheck.too_slow])
@given(
    size=st.integers(min_value=5, max_value=7),
    stars_per_row=st.integers(min_value=2, max_value=2),
    seed=st.integers(min_value=0, max_value=2**32),
)
def test_agrees_with_oracle_on_real_multi_star_regions(
    size: int, stars_per_row: int, seed: int
) -> None:
    """The gap that hid the column bug: several stars per row *and* real regions."""
    rng = random.Random(seed)
    board = random_star_battle_board(size, stars_per_row, rng)
    if board is None:
        return
    assert count_solutions(board, limit=BIG) == oracle_count(board)


@settings(max_examples=40, deadline=None, suppress_health_check=[HealthCheck.too_slow])
@given(size=st.integers(min_value=5, max_value=8), seed=st.integers(min_value=0, max_value=2**32))
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
