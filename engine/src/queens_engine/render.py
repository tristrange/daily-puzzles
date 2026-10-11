"""ASCII rendering of boards for CLI output.

Deliberately separate from the browser UI: the app draws its own board. This is
for `python -m tools.generate`, test failures and the CI log, where a fixed
font makes the puzzle legible in a terminal or patch.

Rendering a whole *puzzle* is not here — it is `Rulebook.render`, because the header
it prints is the puzzle's dimensions and only the type knows what those are. This
module draws the boards, which is what the rulebooks ask it for.
"""

from __future__ import annotations

from typing import Final

from .board import Board
from .tracks import TrackGrid

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


#: One glyph per track piece, indexed by the number the format uses. Index 0 is an
#: empty cell and stays a space, so a gap in the line reads as a gap. The two
#: straights and the four curves are drawn rather than named because the whole
#: point of the puzzle is telling a line running alongside itself from one turning,
#: and a glyph shows that where a letter would hide it.
PIECE_GLYPHS: Final[tuple[str, ...]] = (" ", "─", "│", "└", "┌", "┐", "┘")


def render_grid(grid: TrackGrid) -> str:
    """Render a track grid's givens, row by row, two characters per cell.

    Only the givens. `render_board` takes a solution because a marks board's marks
    *are* the state; a track grid's givens are clues, and showing an answer
    alongside them would need the piece number at every cell rather than the
    occupancy the assignment happens to hold. The first caller to want an answer
    drawn can add it, with the type it is drawing.
    """
    rows = [
        "".join(
            f" {PIECE_GLYPHS[grid.piece_at(grid.index(row, col))]}" for col in range(grid.width)
        )
        for row in range(grid.height)
    ]
    # Same `" " + glyph` shape as `render_board`, so every renderer emits two
    # characters per cell and a row is as wide as its grid without counting.
    return "\n".join(rows)


__all__ = ["PIECE_GLYPHS", "render_board", "render_grid"]
