"""Structural guarantees on `Board`."""

from __future__ import annotations

import pytest
from hypothesis import given
from hypothesis import strategies as st

from queens_engine import Board, BoardError, PuzzleType


def row_partition(size: int) -> tuple[int, ...]:
    """Regions of one full row each: always connected, never self-diagonal."""
    return tuple(row for row in range(size) for _ in range(size))


def make_board(
    size: int,
    regions: tuple[int, ...],
    capacity: tuple[int, ...],
    puzzle_type: PuzzleType = PuzzleType.QUEENS,
) -> Board:
    return Board(
        size=size,
        regions=regions,
        region_capacity=capacity,
        puzzle_type=puzzle_type,
    )


class TestValidBoards:
    def test_row_partition_is_valid(self) -> None:
        board = make_board(5, row_partition(5), (1, 1, 1, 1, 1))
        assert board.cell_count == 25
        assert board.region_count == 5

    def test_geometry_helpers_agree(self) -> None:
        board = make_board(4, row_partition(4), (1, 1, 1, 1))
        assert board.index(2, 3) == 11
        assert board.coords(11) == (2, 3)
        assert board.region_at(11) == 2
        assert board.cells_of_region(3) == (12, 13, 14, 15)

    def test_diagonal_neighbours_of_centre(self) -> None:
        board = make_board(4, row_partition(4), (1, 1, 1, 1))
        assert set(board.diagonal_neighbours(board.index(1, 1))) == {0, 2, 8, 10}

    def test_diagonal_neighbours_of_corner(self) -> None:
        board = make_board(4, row_partition(4), (1, 1, 1, 1))
        assert set(board.diagonal_neighbours(board.index(0, 0))) == {5}

    def test_orthogonal_neighbours_of_centre(self) -> None:
        board = make_board(4, row_partition(4), (1, 1, 1, 1))
        assert set(board.orthogonal_neighbours(board.index(1, 1))) == {1, 4, 6, 9}


class TestRejectedBoards:
    def test_size_out_of_range(self) -> None:
        with pytest.raises(BoardError, match="outside"):
            make_board(1, (0,), (1,))

    def test_region_array_wrong_length(self) -> None:
        with pytest.raises(BoardError, match="expected 16"):
            make_board(4, (0,) * 8, (1, 1, 1, 1))

    def test_region_ids_with_a_gap(self) -> None:
        regions = (0, 0, 0, 0, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4)
        with pytest.raises(BoardError, match="no gaps"):
            make_board(4, regions, (1, 1, 1, 1, 1))

    def test_disconnected_region(self) -> None:
        regions = (0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1)
        with pytest.raises(BoardError, match="not orthogonally connected"):
            make_board(4, regions, (1, 1), PuzzleType.STAR_BATTLE)

    def test_region_may_touch_itself_diagonally(self) -> None:
        # Regions are only required to be 4-connected. Rejecting diagonal
        # self-contact would force every region to be a straight line, since a
        # 4-connected path that turns puts two cells diagonally adjacent, so
        # this is a regression guard for that degenerate rule coming back.
        regions = (0, 0, 1, 1, 0, 0, 1, 1, 2, 2, 3, 3, 2, 2, 3, 3)
        board = make_board(4, regions, (1, 1, 1, 1))
        assert board.region_count == 4

    def test_interlocking_regions_are_accepted(self) -> None:
        # The shapes a real puzzle is made of: here region 2 is a nine-cell
        # blob, not a stripe.
        regions = (2, 2, 2, 2, 3, 2, 2, 2, 3, 2, 2, 2, 3, 0, 1, 1)
        board = make_board(4, regions, (1, 1, 1, 1))
        assert board.region_count == 4
        assert set(board.cells_of_region(2)) == {0, 1, 2, 3, 5, 6, 7, 9, 10, 11}

    def test_queens_requires_one_region_per_row(self) -> None:
        regions = (0,) * 4 + (1,) * 4 + (2,) * 8
        with pytest.raises(BoardError, match="exactly 4 regions"):
            make_board(4, regions, (1, 1, 1))

    def test_queens_rejects_capacity_above_one(self) -> None:
        with pytest.raises(BoardError, match="capacity of exactly 1"):
            make_board(4, row_partition(4), (1, 1, 2, 1))

    def test_capacity_exceeds_region_size(self) -> None:
        regions = (0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1)
        with pytest.raises(BoardError, match="outside"):
            make_board(4, regions, (2, 1), PuzzleType.STAR_BATTLE)


@given(size=st.integers(min_value=2, max_value=16))
def test_row_partition_always_valid(size: int) -> None:
    make_board(size, row_partition(size), (1,) * size)


@given(size=st.integers(min_value=2, max_value=10), data=st.data())
def test_relabelling_regions_preserves_validity(size: int, data: st.DataObject) -> None:
    order = data.draw(st.permutations(range(size)))
    lookup = {original: new for new, original in enumerate(order)}
    relabelled = tuple(lookup[region] for region in row_partition(size))
    make_board(size, relabelled, (1,) * size)
