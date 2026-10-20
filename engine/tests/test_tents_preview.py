"""Small exact checks for the isolated Tents preview, without a seed sweep."""

import json
from pathlib import Path

import pytest
from tools.tents_preview import Tents, pairable, solutions


def test_counts_placements_not_alternative_tree_pairings():
    board = Tents(3, (1, 3, 5, 7), (2, 0, 2), (2, 0, 2))
    assert solutions(board) == [(0, 2, 6, 8)]


def test_distinguishes_zero_one_and_multiple_solutions():
    assert solutions(Tents(2, (0,), (1, 0), (0, 1))) == [(1,)]
    assert solutions(Tents(3, (1, 7), (1, 0, 1), (1, 0, 1))) == [(0, 8), (2, 6)]
    assert solutions(Tents(3, (1, 7), (0, 2, 0), (1, 0, 1))) == []


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


def test_the_three_shipped_previews_have_exactly_one_placement():
    path = Path(__file__).resolve().parents[2] / "app/src/data/tents-previews.json"
    boards = json.loads(path.read_text())
    assert len(boards) == 3
    for raw in boards:
        board = Tents(
            raw["size"], tuple(raw["trees"]), tuple(raw["rowClues"]), tuple(raw["colClues"])
        )
        assert len(solutions(board)) == 1
