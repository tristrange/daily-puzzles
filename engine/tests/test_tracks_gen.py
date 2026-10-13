"""Generating Train Tracks grids, and the properties a published one must have.

The important one is that a grid replays from its seed. `prng.py` exists for exactly
that reason — puzzle files store a seed and are regenerated forever — so a generator
whose output drifts would quietly change published puzzles without any file changing.
That is checked here against a pinned value, not just against itself.
"""

from __future__ import annotations

import pytest

import queens_engine.tracks_gen as gen
from queens_engine.prng import Prng
from queens_engine.tracks import (
    PIECE_ENDS,
    TrackGrid,
    TrackSearchLimitError,
    count_solutions,
    iter_solutions,
)
from queens_engine.tracks_gen import (
    TrackGenerationError,
    _scattered_positions,  # pyright: ignore[reportPrivateUsage]
    generate_grid,
)
from test_tracks import obeys


class TestScatteredGivens:
    def test_positions_split_long_unknown_sections_and_leave_gaps(self) -> None:
        positions = _scattered_positions(list(range(11)))
        assert positions[:2] == [5, 2]
        given = [0, *positions, 10]
        assert len(set(given)) == len(given)
        assert all(abs(a - b) >= 2 for a in given for b in given if a != b)
        assert positions == _scattered_positions(list(range(11)))

    def test_three_cell_route_cannot_hold_a_separated_extra_given(self) -> None:
        assert _scattered_positions([0, 1, 2]) == []

    def test_order_is_along_the_route_even_when_it_doubles_back(self) -> None:
        route = [0, 1, 2, 3, 7, 6, 5, 4, 8, 9, 10]
        assert _scattered_positions(route)[:2] == [5, 2]

    @pytest.mark.parametrize("size", [8, 10, 12])
    def test_requested_sizes_are_unique_nonzero_and_have_separated_givens(self, size: int) -> None:
        grid = generate_grid(seed=0, width=size, height=size, generator_version=3)
        assert all(clue >= 1 for clue in (*grid.row_clues, *grid.col_clues))
        assert count_solutions(grid) == 1
        (solution,) = iter_solutions(grid)
        assert obeys(grid, solution)
        assert (
            sum(
                grid.neighbour(cell, d) is None
                for cell, piece in enumerate(grid.givens)
                for d in PIECE_ENDS[piece]
            )
            == 2
        )
        for cell, piece in enumerate(grid.givens):
            for direction in PIECE_ENDS[piece]:
                other = grid.neighbour(cell, direction)
                assert other is None or (direction + 2) % 4 not in PIECE_ENDS[grid.givens[other]]

    def test_check_exhaustion_adds_a_clue_instead_of_claiming_uniqueness(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        seen: list[int] = []

        def count(grid: TrackGrid, **kwargs: object) -> int:
            seen.append(sum(bool(piece) for piece in grid.givens))
            if len(seen) == 1:
                raise TrackSearchLimitError("incomplete")
            return count_solutions(grid)

        monkeypatch.setattr(gen, "count_solutions", count)
        grid = generate_grid(seed=0, width=8, height=8, generator_version=3)
        assert seen[:2] == [2, 3]
        assert count_solutions(grid) == 1

    def test_aggregate_exhaustion_rejects_the_seed(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(gen, "_SEED_STATES", 0, raising=False)
        with pytest.raises(TrackGenerationError, match="budget"):
            generate_grid(seed=0, width=8, height=8, generator_version=3)

    def test_incomplete_checks_never_return_a_puzzle(self, monkeypatch: pytest.MonkeyPatch) -> None:
        def incomplete(_grid: TrackGrid, **_kwargs: object) -> int:
            raise TrackSearchLimitError("incomplete")

        monkeypatch.setattr(gen, "count_solutions", incomplete)
        monkeypatch.setattr(gen, "_ROUTES", 1)
        monkeypatch.setattr(gen, "_ROUTE_TRIES", 10)
        with pytest.raises(TrackGenerationError, match="no unique"):
            generate_grid(seed=0, width=8, height=8, generator_version=3)

    def test_no_eligible_extra_clue_rejects_the_route(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        seen: list[int] = []

        def ambiguous(grid: TrackGrid, **_kwargs: object) -> int:
            seen.append(sum(bool(piece) for piece in grid.givens))
            return 2

        def no_positions(_route: list[int]) -> list[int]:
            return []

        monkeypatch.setattr(gen, "_scattered_positions", no_positions)
        monkeypatch.setattr(gen, "count_solutions", ambiguous)
        monkeypatch.setattr(gen, "_ROUTES", 1)
        with pytest.raises(TrackGenerationError, match="no unique"):
            generate_grid(seed=0, width=8, height=8, generator_version=3)
        assert seen and set(seen) == {2}

    def test_new_generation_cannot_disable_nonzero_clues(self) -> None:
        with pytest.raises(TrackGenerationError, match="nonzero"):
            generate_grid(
                seed=0, width=8, height=8, generator_version=3, require_nonzero_clues=False
            )

    def test_unknown_generator_version_is_rejected(self) -> None:
        with pytest.raises(TrackGenerationError, match="version"):
            generate_grid(seed=0, width=8, height=8, generator_version=99)


class TestWhatItProduces:
    @pytest.mark.parametrize("seed", [0, 1, 2, 7, 19, 54])
    def test_every_row_and_column_is_used(self, seed: int) -> None:
        grid = generate_grid(seed=seed, width=7, height=7)
        assert all(clue >= 1 for clue in grid.row_clues)
        assert all(clue >= 1 for clue in grid.col_clues)

    @pytest.mark.parametrize(
        "route",
        [
            [7, 8, 9, 10, 11, 12, 13, 20, 19, 18, 17, 16, 15, 14, 21, 22, 23, 24, 25, 26, 27],
            [0, 1, 2, 9, 8, 7, 14, 15, 16, 23, 22, 21, 28, 29, 30, 37, 36, 35, 42, 43, 44],
        ],
        ids=["unused-rows", "unused-columns"],
    )
    def test_unused_lines_are_rejected_before_solving(
        self, monkeypatch: pytest.MonkeyPatch, route: list[int]
    ) -> None:
        def draw_route(_width: int, _height: int, _rng: Prng, _target: int) -> list[int]:
            return route

        def unexpected_solver(_grid: TrackGrid, *, limit: int) -> int:
            pytest.fail(f"unused lines reached the solver with limit={limit}")

        monkeypatch.setattr("queens_engine.tracks_gen._grow_route", draw_route)
        monkeypatch.setattr("queens_engine.tracks_gen.count_solutions", unexpected_solver)
        monkeypatch.setattr("queens_engine.tracks_gen._ROUTES", 1)
        monkeypatch.setattr("queens_engine.tracks_gen._ROUTE_TRIES", 1)
        with pytest.raises(TrackGenerationError, match="no unique grid"):
            generate_grid(seed=7, width=7, height=7)

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

    @pytest.mark.parametrize("seed", [54, 7, 19, 101])
    def test_the_floor_holds_against_the_grid_not_just_the_target(self, seed: int) -> None:
        """A floor measured against the sampled target is not a floor.

        Seed 54 came out with a six-cell line on a 7x7 because its target was low; the
        test here only covered the first few seeds, so it passed while the generator
        did not do what it claimed.
        """
        grid = generate_grid(seed=seed, width=7, height=7)
        assert grid.total >= grid.cell_count // 5

    @pytest.mark.parametrize("size", [(2, 2), (2, 5), (5, 2)])
    def test_a_small_grid_can_still_hold_a_short_line(self, size: tuple[int, int]) -> None:
        """A 2x2 can only sample a target below the shortest legal route.

        Held only against that target, every attempt was discarded and generation
        failed for every seed — even though unique three-cell 2x2 grids exist.
        """
        width, height = size
        grid = generate_grid(seed=1, width=width, height=height)
        assert count_solutions(grid, limit=3) == 1

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

    def test_a_pinned_version_one_grid_stays_put(self) -> None:
        """The value a published puzzle file would replay from.

        If this fails, every Train Tracks puzzle already in the archive has changed
        content while its file — and its seed — stayed the same.
        """
        grid = generate_grid(
            seed=7, width=7, height=7, generator_version=1, require_nonzero_clues=False
        )
        assert grid.row_clues == (0, 0, 4, 7, 5, 4, 0)
        assert grid.col_clues == (1, 1, 2, 4, 4, 4, 4)
        assert grid.total == 20


class TestLimits:
    def test_a_grid_too_small_to_hold_a_line_is_refused(self) -> None:
        with pytest.raises(TrackGenerationError, match="at least 2x2"):
            generate_grid(seed=1, width=1, height=4)

    @pytest.mark.parametrize("cap", [2, 3, 4, 5, 8])
    @pytest.mark.parametrize("seed", [47, 2, 9])
    def test_max_givens_caps_the_whole_set(self, seed: int, cap: int) -> None:
        """The cap is on `grid.givens`, which is what a caller actually reads.

        The two end pieces are mandatory and were being added on top of the cap, so
        `max_givens=0` still returned two givens. The earlier test passed the full cell
        count, so it never reached the boundary at all.
        """
        grid = generate_grid(seed=seed, width=5, height=5, max_givens=cap)
        given = sum(1 for piece in grid.givens if piece)
        assert given <= cap, f"asked for at most {cap} givens, got {given}"
        assert count_solutions(grid, limit=3) == 1

    @pytest.mark.parametrize("cap", [0, 1])
    def test_a_cap_below_the_mandatory_ends_is_refused(self, cap: int) -> None:
        with pytest.raises(TrackGenerationError, match="below the 2 ends"):
            generate_grid(seed=1, width=5, height=5, max_givens=cap)


def _ends(piece: int) -> tuple[int, ...]:
    return PIECE_ENDS[piece]
