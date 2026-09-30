"""ASCII rendering of boards and puzzles for CLI output.

Deliberately separate from the browser UI: the app draws its own board. This is
for `python -m tools.generate`, test failures and the CI log, where a fixed
font makes the puzzle legible in a terminal or patch.
"""

from __future__ import annotations

from .board import Board
from .puzzle import Puzzle
from .solver import iter_solutions

_REGION_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def render_board(board: Board, solution: set[int] | tuple[int, ...] = ()) -> str:
    """Render `board` as rows of region letters, marking queen cells with `Q`.

    Letters are assigned by region id, in order. Queens sit on their own row and
    column, so each row and column shows exactly one `Q` — an easy visual check
    that `render_board` agrees with the solver.
    """
    queued = set(solution)
    rows: list[str] = []
    for row in range(board.size):
        cells: list[str] = []
        for col in range(board.size):
            cell = board.index(row, col)
            symbol = "Q" if cell in queued else _REGION_LETTERS[board.region_at(cell)]
            cells.append(f" {symbol}")
        rows.append("".join(cells))
    return "\n".join(rows)


def render_puzzle(puzzle: Puzzle) -> str:
    """A puzzle with a header line (id, size, seed) above its board.

    `seed` lets a human reproduce the exact grid by re-running the generator;
    the header is part of the ASCII contract so pasted boards stay attributable.
    """
    best = _best_solution(puzzle)
    header = f"{puzzle.id} seed={puzzle.seed} size={puzzle.size}x{puzzle.size}"
    if best is not None:
        return f"{header}\n{render_board(puzzle.board, best)}"
    return f"{header}\n{render_board(puzzle.board)}"


def _best_solution(puzzle: Puzzle) -> tuple[int, ...] | None:
    for solution in iter_solutions(puzzle.board):
        return solution
    return None


__all__ = ["render_board", "render_puzzle"]
