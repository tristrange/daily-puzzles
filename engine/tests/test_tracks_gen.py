"""Generating Train Tracks grids, and the properties a published one must have.

The important one is that a grid replays from its seed. `prng.py` exists for exactly
that reason — puzzle files store a seed and are regenerated forever — so a generator
whose output drifts would quietly change published puzzles without any file changing.
That is checked here against a pinned value, not just against itself.
"""

from __future__ import annotations

import pytest

from queens_engine.tracks import PIECE_ENDS, count_solutions, iter_solutions
from queens_engine.tracks_gen import TrackGenerationError, generate_grid
from test_tracks import obeys


class TestWhatItProduces:
    @pytest.mark.parametrize("seed", range(6))
    def test_the_grid_has_exactly_one_solution(self, seed: int) -> None:
        grid = generate_grid(seed=seed, width=7, height=7)
        assert count_solutions(grid, limit=3) == 1
        assert len(list(iter_solutions(grid))) == 1

    @pytest.mark.parametrize("seed", range(6))
    def test_the_solution_obeys_the_rules(self, seed: int) -> None:
        """Re-checked from scratch, not taken on the solver's word."""
        grid = generate_grid(seed=seed, width=7, height=7)
        (only,) = iter_solutions(grid)
        assert obeys(grid, only)

    @pytest.mark.parametrize("seed", range(4))
    def test_both_ends_are_given(self, seed: int) -> None:
        grid = generate_grid(seed=seed, width=7, height=7)
        open_cells = sum(
            1
            for cell, piece in enumerate(grid.givens)
            if piece and any(grid.neighbour(cell, end) is None for end in _ends(piece))
        )
        assert open_cells == 2

    @pytest.mark.parametrize("seed", range(4))
    def test_the_line_fills_a_useful_share_of_the_grid(self, seed: int) -> None:
        """A floor, not a target.

        Across twenty seeds on a 7x7 the line fills between 9 and 22 of the 49 cells.
        The greedy walk boxes itself in often enough that a fifth is the honest floor to
        hold it to; a route much shorter than that has one obvious answer and nothing
        to decide. If this ever needs raising, the fix belongs in the walk rather than
        in the expectation.
        """
        grid = generate_grid(seed=seed, width=7, height=7)
        assert grid.total >= grid.cell_count // 5, "too sparse to be worth solving"

    @pytest.mark.parametrize("size", [(5, 6), (6, 5), (8, 8), (4, 9)])
    def test_non_square_grids_are_fine(self, size: tuple[int, int]) -> None:
        width, height = size
        grid = generate_grid(seed=3, width=width, height=height)
        assert (grid.width, grid.height) == size
        assert count_solutions(grid, limit=3) == 1


class TestReplay:
    def test_the_same_seed_gives_the_same_grid(self) -> None:
        first = generate_grid(seed=42, width=7, height=7)
        second = generate_grid(seed=42, width=7, height=7)
        assert first == second

    def test_different_seeds_give_different_grids(self) -> None:
        grids = {generate_grid(seed=seed, width=7, height=7) for seed in range(8)}
        assert len(grids) > 1, "every seed produced the same puzzle"

    def test_a_pinned_grid_stays_put(self) -> None:
        """The value a published puzzle file would replay from.

        If this fails, every Train Tracks puzzle already in the archive has changed
        content while its file — and its seed — stayed the same.
        """
        grid = generate_grid(seed=7, width=7, height=7)
        assert grid.row_clues == (0, 0, 4, 7, 5, 4, 0)
        assert grid.col_clues == (1, 1, 2, 4, 4, 4, 4)
        assert grid.total == 20


class TestLimits:
    def test_a_grid_too_small_to_hold_a_line_is_refused(self) -> None:
        with pytest.raises(TrackGenerationError, match="at least 2x2"):
            generate_grid(seed=1, width=1, height=4)

    def test_max_givens_caps_how_much_is_given_away(self) -> None:
        loose = generate_grid(seed=2, width=7, height=7)
        tight = generate_grid(seed=2, width=7, height=7, max_givens=len(loose.givens))
        assert sum(1 for piece in tight.givens if piece) == sum(
            1 for piece in loose.givens if piece
        )


def _ends(piece: int) -> tuple[int, ...]:
    return PIECE_ENDS[piece]
