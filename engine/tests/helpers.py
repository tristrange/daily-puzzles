"""Shared helpers for the marks-genre tests.

`Puzzle.board` is `Board | TrackGrid`, because Train Tracks plays a grid that is
not made of regions and is not square. Tests about the marks genres still read
regions, capacities and `size` directly, and they all mean "the marks board this
puzzle holds".

One narrow in one place rather than a guard in each of them, in the same spirit
as the cross-file imports this suite already uses (`obeys_the_rules`, `obeys`).
"""

from __future__ import annotations

from queens_engine import Board, Puzzle, as_marks_board


def marks_board(puzzle: Puzzle) -> Board:
    """The marks board a puzzle holds, narrowed from `Board | TrackGrid`.

    Raises if the puzzle is not a marks one, which is what a test reaching for
    regions on a track grid deserves: the failure names the mistake rather than
    surfacing later as a missing attribute.
    """
    return as_marks_board(puzzle.board)
