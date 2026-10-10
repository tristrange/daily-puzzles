"""ASCII rendering of boards for CLI output.

Deliberately separate from the browser UI: the app draws its own board. This is
for `python -m tools.generate`, test failures and the CI log, where a fixed
font makes the puzzle legible in a terminal or patch.

Rendering a whole *puzzle* is not here — it is `Rulebook.render`, because the header
it prints is the puzzle's dimensions and only the type knows what those are. This
module draws the marks board, which is what the marks rulebook asks it for.
"""

from __future__ import annotations

from .board import Board

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


__all__ = ["render_board"]
