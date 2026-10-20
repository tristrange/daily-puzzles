"""Small exact checks for the isolated Tents preview, without a seed sweep."""

import json
from pathlib import Path

import pytest
from tools.tents_preview import PREVIEW_RECIPES, Tents, candidate, pairable, solutions


def test_counts_placements_not_alternative_tree_pairings():
    board = Tents(3, (1, 3, 5, 7), (2, 0, 2), (2, 0, 2))
    assert solutions(board) == [(0, 2, 6, 8)]


def test_distinguishes_zero_one_and_multiple_solutions():
    assert solutions(Tents(2, (0,), (1, 0), (0, 1))) == [(1,)]
    assert solutions(Tents(3, (1, 7), (1, 0, 1), (1, 0, 1))) == [(0, 8), (2, 6)]
    assert solutions(Tents(3, (1, 7), (0, 2, 0), (1, 0, 1))) == []


def test_ten_by_ten_counts_placements_at_the_bottom_edge():
    board = Tents(10, (99,), (0,) * 9 + (1,), (0,) * 8 + (1, 0))
    assert solutions(board) == [(98,)]


def test_pairing_requires_a_bijection_even_when_every_piece_has_a_neighbour():
    assert not pairable(5, (1, 17, 23), (0, 2, 18))
    assert pairable(3, (1, 3, 5, 7), (0, 2, 6, 8))


def test_exhaustion_never_certifies_uniqueness():
    with pytest.raises(RuntimeError, match="budget"):
        solutions(Tents(3, (1, 7), (1, 0, 1), (1, 0, 1)), budget=1)


@pytest.mark.parametrize(
    "trees, rows, cols",
    [
        ((0, 0), (1, 1), (1, 1)),
        ((4,), (1, 0), (1, 0)),
        ((0,), (True, 0), (1, 0)),
        ((0,), (0, 0), (1, 0)),
    ],
)
def test_rejects_malformed_boards(
    trees: tuple[int, ...], rows: tuple[int, ...], cols: tuple[int, ...]
) -> None:
    with pytest.raises(ValueError):
        Tents(2, trees, rows, cols)


def test_shipped_previews_are_reproducible_unique_and_new_boards_use_every_line():
    path = Path(__file__).resolve().parents[2] / "app/src/data/tents-previews.json"
    boards = json.loads(path.read_text())
    assert len(boards) == len(PREVIEW_RECIPES) == 9
    for index, (raw, (size, seed)) in enumerate(zip(boards, PREVIEW_RECIPES, strict=True)):
        board = Tents(
            raw["size"], tuple(raw["trees"]), tuple(raw["rowClues"]), tuple(raw["colClues"])
        )
        assert len(solutions(board)) == 1
        assert candidate(seed, size=size) == board
        if index >= 3:
            assert min(*board.rows, *board.cols) > 0
