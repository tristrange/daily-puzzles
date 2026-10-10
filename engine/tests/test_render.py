"""ASCII rendering stays a lossless human view of the board."""

from __future__ import annotations

from queens_engine import (
    Board,
    Puzzle,
    PuzzleType,
    generate_puzzle,
    render_board,
    rulebook_for,
)
from queens_engine.solver import iter_solutions


def _render(puzzle: Puzzle) -> str:
    """The puzzle as ASCII, through the rulebook that owns the rendering."""
    return rulebook_for(puzzle.puzzle_type).render(puzzle)


def _board() -> Board:
    return Board(
        size=3,
        regions=(0, 0, 1, 0, 1, 1, 2, 2, 2),
        region_capacity=(1,) * 3,
        puzzle_type=PuzzleType.QUEENS,
    )


def test_render_board_marks_every_region() -> None:
    rendered = render_board(_board())
    letters = {symbol for line in rendered.splitlines() for symbol in line.split()}
    assert letters == {"A", "B", "C"}


def test_render_board_spaces_each_cell() -> None:
    rendered = render_board(_board())
    for line in rendered.splitlines():
        assert len(line.split()) == 3  # one wide symbol per cell


def test_render_board_marks_solution_with_queen() -> None:
    board = _board()
    rendered = render_board(board, solution=(board.index(0, 0),))
    assert rendered.count("Q") == 1


def test_render_puzzle_header_and_grid() -> None:
    puzzle = generate_puzzle(seed=4, puzzle_id="2026-01-01", config=None)
    rendered = _render(puzzle)
    lines = rendered.splitlines()
    assert lines[0].startswith("2026-01-01")
    assert f"seed={puzzle.seed}" in lines[0]
    grid = lines[1]
    assert len(grid.split()) == puzzle.board.size


def test_render_puzzle_uses_real_solution() -> None:
    puzzle = generate_puzzle(seed=4, puzzle_id="2026-01-01")
    rendered = _render(puzzle)
    lines = rendered.splitlines()[1:]
    expected = {
        (row, col)
        for row, line in enumerate(lines)
        for col, cell in enumerate(line.split())
        if cell == "Q"
    }
    actual = {divmod(cell, puzzle.board.size) for cell in next(iter_solutions(puzzle.board))}
    assert expected == actual


def test_render_puzzle_uniqueness_visible() -> None:
    puzzle = generate_puzzle(seed=4, puzzle_id="2026-01-01")
    rendered = _render(puzzle)
    rows = rendered.splitlines()[1:]
    assert all(row.count("Q") == 1 for row in rows)
    assert all(
        sum(row.split()[col] == "Q" for row in rows) == 1 for col in range(puzzle.board.size)
    )
