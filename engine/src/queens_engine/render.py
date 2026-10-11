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
from .tracks import Assignment, TrackGrid

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


def render_grid(grid: TrackGrid, solution: Assignment | None = None) -> str:
    """Render a track grid, row by row, one space between cells.

    With a solution, the line's cells are shown and the rest blanked, so the
    rendered board is a player's view of the answer rather than a second way of
    reading the givens. The givens are always drawn — they are clues, and hiding
    them would make the output useless for checking a puzzle.
    """
    filled = set(solution) if solution is not None else None
    rows: list[str] = []
    for row in range(grid.height):
        cells: list[str] = []
        for col in range(grid.width):
            cell = grid.index(row, col)
            piece = grid.givens[cell]
            if filled is not None and piece == 0 and cell not in filled:
                cells.append(" ")
            else:
                cells.append(PIECE_GLYPHS[piece])
        # Same `" " + glyph` shape as `render_board`, so every renderer emits two
        # characters per cell and a row is as wide as its grid without counting.
        rows.append("".join(f" {glyph}" for glyph in cells))
    return "\n".join(rows)


__all__ = ["PIECE_GLYPHS", "render_board", "render_grid"]
