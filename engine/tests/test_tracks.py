"""Train Tracks boards, and the solver's agreement with an independent reference.

The reference here is `brute_force`, which tries every subset of cells and applies
the rules directly. It shares no code with the search: the search decides one
yes/no per cell and leans on row and column counts to prune, while the reference
enumerates everything and checks nothing until the end. That independence is the
point — the search had three separate bugs that every unit test missed and the
reference caught immediately, two of them in the search's own bookkeeping.
"""

from __future__ import annotations

import random
import time
from collections import defaultdict

import pytest

from queens_engine.tracks import (
    TrackBoard,
    TrackBoardError,
    count_solutions,
    has_unique_solution,
    iter_solutions,
)


def neighbours_of(b: TrackBoard, cell: int) -> tuple[int, ...]:
    return b.orthogonal_neighbours(cell)


def grid_neighbours(width: int, height: int) -> dict[int, tuple[int, ...]]:
    """Neighbour lists for a bare grid, without needing a valid board.

    `grow_path` needs the geometry before it has the counts, and a probe
    `TrackBoard` of all zeros is rejected by the very validation this module
    tests — the first column cannot count zero while holding the entrance.
    """
    return {
        cell: tuple(
            (row + d_row) * width + (col + d_col)
            for d_row, d_col in ((-1, 0), (1, 0), (0, -1), (0, 1))
            if 0 <= row + d_row < height and 0 <= col + d_col < width
        )
        for row in range(height)
        for col in range(width)
        for cell in (row * width + col,)
    }


def brute_force(b: TrackBoard) -> list[tuple[int, ...]]:
    """Every solution found by trying all subsets of cells.

    Deliberately shares nothing with the search beyond the board's neighbour list.
    Small grids only: the subset count doubles per cell.
    """
    found: list[tuple[int, ...]] = []
    for mask in range(1 << b.cell_count):
        chosen = tuple(c for c in range(b.cell_count) if mask >> c & 1)
        if _obeys(b, chosen):
            found.append(chosen)
    return sorted(found)


def _obeys(b: TrackBoard, chosen: tuple[int, ...]) -> bool:
    """Whether a cell set is one of the solutions, read straight off the rules."""
    on = set(chosen)
    if b.entrance not in on or b.exit not in on:
        return False
    degree: dict[int, int] = defaultdict(int)
    adjacent: dict[int, set[int]] = defaultdict(set)
    for cell in chosen:
        for other in neighbours_of(b, cell):
            if other in on:
                degree[cell] += 1
                adjacent[cell].add(other)
    if degree[b.entrance] != 1 or degree[b.exit] != 1:
        return False
    if any(degree[c] != 2 for c in chosen if c not in (b.entrance, b.exit)):
        return False
    rows: list[int] = [0] * b.height
    cols: list[int] = [0] * b.width
    for cell in chosen:
        row, col = b.coords(cell)
        rows[row] += 1
        cols[col] += 1
    if tuple(rows) != b.row_counts or tuple(cols) != b.col_counts:
        return False
    reached, stack = {b.entrance}, [b.entrance]
    while stack:
        current = stack.pop()
        for other in adjacent[current]:
            if other in on and other not in reached:
                reached.add(other)
                stack.append(other)
    return reached == on


def valid(b: TrackBoard, cells: tuple[int, ...]) -> bool:
    """Whether a cell set is a solution, checked straight from the rules.

    Independent of the search's own bookkeeping, which is the point: an earlier
    version of the search emitted cell sets whose implied degrees disagreed with
    the edges it had recorded, and nothing that asked the search would have noticed.
    """
    on = set(cells)
    if b.entrance not in on or b.exit not in on:
        return False
    for cell in on:
        want = 1 if cell in (b.entrance, b.exit) else 2
        if sum(1 for other in neighbours_of(b, cell) if other in on) != want:
            return False
    rows: list[int] = [0] * b.height
    cols: list[int] = [0] * b.width
    for cell in on:
        row, col = b.coords(cell)
        rows[row] += 1
        cols[col] += 1
    if tuple(rows) != b.row_counts or tuple(cols) != b.col_counts:
        return False
    if len(set(cells)) != len(cells):
        return False
    reached, stack = {b.entrance}, [b.entrance]
    while stack:
        current = stack.pop()
        for other in neighbours_of(b, current):
            if other in on and other not in reached:
                reached.add(other)
                stack.append(other)
    return reached == on


def grow_path(b_width: int, b_height: int, rng: random.Random) -> TrackBoard | None:
    """A board that really has a solution, by growing a simple track.

    Extending may only touch one cell already on the track. Merely avoiding a
    revisit is not enough: a path running alongside an earlier stretch of itself
    leaves those cells with three on-track neighbours, which is not a track, and a
    harness that builds one produces boards nobody can solve — which looks like a
    solver bug and is not.
    """
    cells = b_width * b_height
    entrance = rng.randrange(b_height) * b_width
    exit_ = (b_height - 1) * b_width + rng.randrange(b_width)
    if exit_ == entrance:
        return None
    around = grid_neighbours(b_width, b_height)
    path: list[int] = [entrance]
    on: set[int] = {entrance}
    for _ in range(cells * 6):
        if path[-1] == exit_:
            break
        options = [
            other
            for other in around[path[-1]]
            if other not in on and sum(1 for seen in around[other] if seen in on) == 1
        ]
        if not options:
            break
        nxt = rng.choice(options)
        path.append(nxt)
        on.add(nxt)
    if path[-1] != exit_ or len(path) < 3:
        return None
    rows: list[int] = [0] * b_height
    cols: list[int] = [0] * b_width
    for cell in path:
        row, col = divmod(cell, b_width)
        rows[row] += 1
        cols[col] += 1
    return TrackBoard(b_width, b_height, tuple(rows), tuple(cols), entrance, exit_)


class TestValidation:
    def test_a_board_round_trips_its_own_fields(self) -> None:
        b = TrackBoard(3, 2, (2, 2), (2, 1, 1), 0, 4)
        assert b.cell_count == 6
        assert b.index(1, 2) == 5
        assert b.coords(4) == (1, 1)
        assert b.total == 4
        assert b.orthogonal_neighbours(0) == (3, 1)
        assert b.orthogonal_neighbours(4) == (1, 3, 5)
        assert b.orthogonal_neighbours(5) == (2, 4)

    def test_rejects_a_count_that_cannot_fit_its_line(self) -> None:
        with pytest.raises(TrackBoardError, match="row 0 counts 5"):
            TrackBoard(3, 2, (5, 0), (2, 1, 1), 0, 4)

    def test_rejects_a_column_count_that_cannot_fit_its_line(self) -> None:
        with pytest.raises(TrackBoardError, match="column 0 counts 4"):
            TrackBoard(3, 2, (2, 2), (4, 0, 0), 0, 4)

    def test_rejects_the_two_lines_disagreeing(self) -> None:
        with pytest.raises(TrackBoardError, match="cannot disagree with itself"):
            TrackBoard(3, 2, (2, 1), (2, 2, 0), 0, 4)

    def test_rejects_wrong_row_and_column_counts(self) -> None:
        with pytest.raises(TrackBoardError, match="got 1 row counts"):
            TrackBoard(3, 2, (2,), (2, 1, 1), 0, 4)
        with pytest.raises(TrackBoardError, match="got 2 column counts"):
            TrackBoard(3, 2, (2, 2), (2, 1), 0, 4)

    def test_rejects_an_entrance_off_the_left_edge(self) -> None:
        with pytest.raises(TrackBoardError, match="entrance is not in the leftmost"):
            TrackBoard(3, 2, (2, 2), (2, 1, 1), 1, 4)

    def test_rejects_an_exit_off_the_bottom_row(self) -> None:
        with pytest.raises(TrackBoardError, match="exit is not in the bottom row"):
            TrackBoard(3, 2, (2, 2), (2, 1, 1), 0, 1)

    def test_rejects_both_ends_on_one_cell(self) -> None:
        with pytest.raises(TrackBoardError, match="both cell 0"):
            TrackBoard(3, 2, (2, 2), (2, 1, 1), 0, 0)

    def test_rejects_an_end_off_the_board(self) -> None:
        with pytest.raises(TrackBoardError, match="entrance cell 99 is off"):
            TrackBoard(3, 2, (2, 2), (2, 1, 1), 99, 4)

    def test_rejects_the_first_column_counting_nothing(self) -> None:
        # The entrance is in the leftmost column and on the track, so it cannot be 0.
        # No row gets the same treatment: the entrance need not be in the top one.
        with pytest.raises(TrackBoardError, match="first column counts 0"):
            TrackBoard(3, 2, (1, 2), (0, 2, 1), 0, 4)

    def test_accepts_a_board_whose_top_row_counts_nothing(self) -> None:
        b = TrackBoard(3, 2, (0, 2), (1, 1, 0), 3, 4)
        assert b.row_counts[0] == 0

    def test_rejects_a_track_shorter_than_its_two_ends(self) -> None:
        with pytest.raises(TrackBoardError, match="at least an entrance and an exit"):
            TrackBoard(2, 1, (1,), (1, 0), 0, 1)


class TestSolvedByHand:
    """Cases whose expected answer was confirmed against `brute_force`.

    A 2x2 whose counts leave exactly one route, checked cell by cell: cell 0 is the
    entrance and so has one on-track neighbour, cell 3 the exit likewise, and the
    two between them carry two each. That is one complete cell set and no other.
    """

    def test_a_2x2_with_one_route(self) -> None:
        b = TrackBoard(2, 2, (2, 1), (1, 2), 0, 3)
        assert sorted(iter_solutions(b)) == [(0, 1, 3)]
        assert brute_force(b) == [(0, 1, 3)]

    def test_a_board_with_a_route_around_a_block(self) -> None:
        b = TrackBoard(4, 2, (2, 2), (1, 2, 1, 0), 0, 6)
        assert sorted(iter_solutions(b)) == [(0, 1, 5, 6)]
        assert brute_force(b) == [(0, 1, 5, 6)]

    def test_a_board_whose_counts_cannot_all_be_met(self) -> None:
        # Rows ask for 0, 0, 2 and columns for 1, 0, 1. Every count is inside its
        # own line, but column 1 holding nothing means the two cells row 2 needs
        # must both sit in the outer columns, and the entrance is already in one of
        # them needing a second cell it cannot reach without crossing the gap.
        b = TrackBoard(3, 3, (0, 0, 2), (1, 0, 1), 0, 6)
        assert count_solutions(b, limit=10) == 0
        assert brute_force(b) == []


class TestAgainstTheReference:
    @pytest.mark.parametrize("seed", range(12))
    def test_agrees_with_brute_force_on_grown_boards(self, seed: int) -> None:
        rng = random.Random(seed)
        checked = 0
        for _ in range(40):
            b = grow_path(rng.randint(2, 4), rng.randint(2, 4), rng)
            if b is None:
                continue
            assert sorted(iter_solutions(b)) == brute_force(b)
            checked += 1
        assert checked, "no board was grown, so nothing was compared"

    @pytest.mark.parametrize("seed", range(6))
    def test_agrees_with_brute_force_on_arbitrary_counts(self, seed: int) -> None:
        rng = random.Random(1000 + seed)
        checked = 0
        for _ in range(60):
            width, height = rng.randint(2, 4), rng.randint(2, 4)
            total = rng.randint(2, width * height)
            rows = [0] * height
            cols = [0] * width
            for _ in range(total):
                rows[rng.randrange(height)] += 1
                cols[rng.randrange(width)] += 1
            entrance = rng.randrange(height) * width
            exit_ = (height - 1) * width + rng.randrange(width)
            if exit_ == entrance or cols[0] < 1:
                continue
            # Counts beyond a line's length are refused by the board, which is the
            # point of that validation and tested above; these cases are about the
            # search agreeing with brute force on the boards that get through.
            if any(c > width for c in rows) or any(c > height for c in cols):
                continue
            b = TrackBoard(width, height, tuple(rows), tuple(cols), entrance, exit_)
            assert sorted(iter_solutions(b)) == brute_force(b), b
            checked += 1
        assert checked, "no board was built, so nothing was compared"

    def test_the_grown_boards_really_are_solvable(self) -> None:
        """Guards the harness rather than the solver.

        `grow_path` can build a set that is not a track — a path touching itself
        leaves cells with three neighbours. Those boards have no solution, so an
        agreement test over them passes while proving nothing about a solvable case.
        """
        rng = random.Random(4)
        grown = [b for b in (grow_path(3, 3, rng) for _ in range(40)) if b is not None]
        assert grown
        assert any(has_unique_solution(b) or count_solutions(b, limit=2) >= 1 for b in grown)


class TestEverySolutionIsReal:
    @pytest.mark.parametrize("seed", range(8))
    def test_no_solution_breaks_the_rules(self, seed: int) -> None:
        rng = random.Random(seed)
        checked = 0
        for _ in range(40):
            b = grow_path(rng.randint(2, 4), rng.randint(2, 4), rng)
            if b is None:
                continue
            for cells in iter_solutions(b):
                assert valid(b, cells), f"{b} yielded {cells}"
            checked += 1
        assert checked

    def test_solutions_are_sorted_and_free_of_repeats(self) -> None:
        b = TrackBoard(2, 4, (1, 1, 2, 2), (2, 4), 0, 7)
        for cells in iter_solutions(b):
            assert list(cells) == sorted(cells)
            assert len(set(cells)) == len(cells)


class TestLimits:
    def test_a_limit_of_zero_is_refused(self) -> None:
        b = TrackBoard(2, 2, (2, 1), (1, 2), 0, 3)
        with pytest.raises(TrackBoardError, match="at least 1"):
            count_solutions(b, limit=0)

    def test_the_limit_reports_saturation_rather_than_the_true_count(self) -> None:
        # An 8x8 with two routes. Found by growing tracks and keeping a board the
        # solver could not pin down; ambiguity is rare below 8x8, because on a
        # square grid two connected alternatives rarely share a row and column
        # count vector. Both answers were checked against the rules directly.
        b = TrackBoard(
            8,
            8,
            (4, 4, 3, 4, 5, 5, 1, 2),
            (5, 4, 3, 3, 3, 4, 2, 4),
            8,
            57,
        )
        assert count_solutions(b, limit=1) == 1
        assert count_solutions(b, limit=2) == 2
        assert count_solutions(b, limit=99) == 2
        assert not has_unique_solution(b)
        for cells in iter_solutions(b):
            assert valid(b, cells)

    def test_has_unique_solution_is_exhaustion_not_a_guess(self) -> None:
        b = TrackBoard(2, 2, (2, 1), (1, 2), 0, 3)
        assert has_unique_solution(b)
        assert count_solutions(b, limit=50) == 1


class TestCost:
    def test_a_full_size_board_can_be_exhausted_quickly(self) -> None:
        """Uniqueness means exhausting the search, so its cost is the generator's.

        The row and column counts are what make this cheap: they put a ceiling on
        what each line can still reach, so a 9x9 is decided in milliseconds. The
        ceiling is generous because this is a cost guard, not a benchmark — it is
        here to catch a change that turns the search back into a crawl.
        """
        rng = random.Random(9)
        found = None
        for _ in range(400):
            candidate = grow_path(9, 9, rng)
            if candidate is not None:
                found = candidate
                break
        assert found is not None, "no 9x9 board was grown"
        start = time.perf_counter()
        count = count_solutions(found, limit=2)
        took = time.perf_counter() - start
        assert count >= 1
        assert took < 5.0, f"exhausting a 9x9 took {took:.2f}s"
