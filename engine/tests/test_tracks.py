"""Train Tracks grids, and the solver's agreement with an independent reference.

The reference here assigns a piece to every cell and applies the rules directly. It
shares no state with the search — no union-find, no count bookkeeping — and
re-derives every rule from `PIECE_ENDS` each time. That independence is the point,
and it is not decoration: an earlier version of this solver reduced a solution to
the set of cells the line touched, which is wrong precisely because two adjacent
track cells need not be joined, and no test written against the solver's own idea
of a solution would have noticed.
"""

from __future__ import annotations

import random
import time

import pytest

from queens_engine.tracks import (
    EAST,
    LINE_ENDS,
    NORTH,
    PIECE_COUNT,
    PIECE_ENDS,
    SOUTH,
    WEST,
    TrackGrid,
    TrackGridError,
    count_solutions,
    has_unique_solution,
    iter_solutions,
)

#: A piece number for each pair of directions, for building expected answers by hand.
_BY_ENDS = {frozenset(ends): index for index, ends in enumerate(PIECE_ENDS) if ends}

HORIZONTAL = _BY_ENDS[frozenset({EAST, WEST})]
VERTICAL = _BY_ENDS[frozenset({NORTH, SOUTH})]


def piece(assignment: dict[int, int], width: int, height: int) -> tuple[int, ...]:
    """Expand a sparse cell -> piece mapping into a full row-major assignment."""
    out = [0] * (width * height)
    for cell, value in assignment.items():
        out[cell] = value
    return tuple(out)


def solved(width: int, height: int) -> TrackGrid:
    """The smallest grid the rules allow: a straight line across the bottom row.

    Both end pieces are given, the line runs off the left and right edges, and the
    clues say what the line plainly is. Useful as a known-answer case that needs no
    solving to verify.
    """
    assignment = piece({width * (height - 1) + c: HORIZONTAL for c in range(width)}, width, height)
    return TrackGrid(
        width,
        height,
        (*tuple(0 for _ in range(height - 1)), width),
        (1,) * width,
        assignment,
    )


class TestValidation:
    def test_rejects_a_clue_beyond_its_line(self) -> None:
        with pytest.raises(TrackGridError, match="row clue 1 is 4"):
            TrackGrid(3, 3, (0, 4, 3), (1, 3, 3), (0,) * 9)

    def test_rejects_a_column_clue_beyond_its_line(self) -> None:
        with pytest.raises(TrackGridError, match="column clue 0 is 5"):
            TrackGrid(3, 3, (1, 1, 1), (5, 1, 1), (0,) * 9)

    def test_rejects_the_two_clue_sets_disagreeing(self) -> None:
        with pytest.raises(TrackGridError, match="cannot disagree with itself"):
            TrackGrid(3, 3, (1, 1, 1), (2, 1, 1), (0,) * 9)

    def test_rejects_wrong_clue_and_given_lengths(self) -> None:
        with pytest.raises(TrackGridError, match="got 2 row clues"):
            TrackGrid(3, 3, (1, 1), (1, 1, 1), (0,) * 9)
        with pytest.raises(TrackGridError, match="got 8 givens"):
            TrackGrid(3, 3, (1, 1, 1), (1, 1, 1), (0,) * 8)

    def test_rejects_a_piece_number_out_of_range(self) -> None:
        givens = [0] * 9
        givens[0] = PIECE_COUNT + 1
        with pytest.raises(TrackGridError, match="but pieces run 0 to"):
            TrackGrid(3, 3, (1, 1, 1), (1, 1, 1), tuple(givens))

    def test_rejects_anything_but_exactly_two_open_end_cells(self) -> None:
        # One given end piece: the line's far end is unaccounted for.
        givens = [0] * 9
        givens[0] = HORIZONTAL
        with pytest.raises(TrackGridError, match="1 given pieces run off"):
            TrackGrid(3, 3, (1, 1, 1), (1, 1, 1), tuple(givens))

    def test_counts_a_corner_piece_once_however_many_ends_it_has(self) -> None:
        # The spec's check is on *cells*, not ends: a corner curve with both ends off
        # the grid is one cell running out, so a grid needing two such cells has one.
        givens = [0] * 9
        givens[0] = _BY_ENDS[frozenset({NORTH, WEST})]
        with pytest.raises(TrackGridError, match="1 given pieces run off"):
            TrackGrid(3, 3, (1, 1, 1), (1, 1, 1), tuple(givens))

    def test_rejects_three_open_ends(self) -> None:
        givens = [0] * 9
        givens[0] = HORIZONTAL  # left edge
        givens[2] = HORIZONTAL  # right edge
        givens[8] = _BY_ENDS[frozenset({SOUTH, WEST})]  # bottom-left corner
        with pytest.raises(TrackGridError, match="3 given pieces run off"):
            TrackGrid(3, 3, (1, 1, 2), (1, 1, 2), tuple(givens))

    def test_rejects_a_line_shorter_than_its_two_end_cells(self) -> None:
        givens = [0] * 9
        givens[0] = HORIZONTAL
        givens[2] = HORIZONTAL
        with pytest.raises(TrackGridError, match="at least its two end cells"):
            TrackGrid(3, 3, (0, 0, 1), (1, 0, 0), tuple(givens))

    def test_rejects_a_non_positive_size(self) -> None:
        with pytest.raises(TrackGridError, match="positive size"):
            TrackGrid(0, 3, (), (0, 0, 0), ())


class TestThePieceTable:
    def test_there_are_six_pieces_and_an_empty_cell(self) -> None:
        assert len(PIECE_ENDS) == PIECE_COUNT + 1
        assert PIECE_ENDS[0] == ()
        assert all(len(ends) == 2 for ends in PIECE_ENDS[1:])

    def test_two_pieces_are_straight_and_four_are_curves(self) -> None:
        opposite = sum(1 for ends in PIECE_ENDS[1:] if (ends[0] + 2) % 4 == ends[1])
        assert opposite == 2, "straights join opposite directions"
        assert len(PIECE_ENDS) - 1 - opposite == 4, "curves join adjacent ones"

    def test_every_direction_appears_in_every_piece_count(self) -> None:
        for direction in (NORTH, EAST, SOUTH, WEST):
            assert sum(1 for ends in PIECE_ENDS[1:] if direction in ends) == 3


class TestKnownAnswers:
    def test_a_straight_line_across_the_bottom_row(self) -> None:
        grid = solved(3, 3)
        assert list(iter_solutions(grid)) == [
            (0, 0, 0, 0, 0, 0, HORIZONTAL, HORIZONTAL, HORIZONTAL)
        ]

    def test_a_two_cell_line_with_no_room_to_turn(self) -> None:
        # A 2-wide, 1-tall grid: the only pieces that fit are the two end pieces, and
        # the line is forced.
        grid = TrackGrid(2, 1, (2,), (1, 1), (HORIZONTAL, HORIZONTAL))
        assert list(iter_solutions(grid)) == [(HORIZONTAL, HORIZONTAL)]

    def test_a_line_that_must_turn(self) -> None:
        # Down the left column, round the corner, right along the bottom. Only the two
        # end pieces are given, so the corner curve and the middle straight are
        # deduced from the counts and from reciprocity.
        turn = _BY_ENDS[frozenset({NORTH, EAST})]
        grid = TrackGrid(3, 2, (1, 3), (2, 1, 1), (VERTICAL, 0, 0, 0, 0, HORIZONTAL))
        assert list(iter_solutions(grid)) == [(VERTICAL, 0, 0, turn, HORIZONTAL, HORIZONTAL)]
        assert _reference(grid) == [(VERTICAL, 0, 0, turn, HORIZONTAL, HORIZONTAL)]

    def test_a_grid_with_two_routes_has_both(self) -> None:
        # Grown with only the two end pieces given, so the middle is genuinely open:
        # the counts and reciprocity admit two ways round. Found by growing grids and
        # keeping the ones the solver could not pin down.
        grid = TrackGrid(
            4,
            4,
            (3, 3, 4, 2),
            (1, 3, 4, 4),
            (0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 4, 0),
        )
        solutions = sorted(iter_solutions(grid))
        assert solutions == [
            (0, 4, 1, 5, 0, 2, 4, 6, 1, 6, 3, 5, 0, 0, 4, 6),
            (0, 4, 1, 5, 0, 3, 5, 2, 1, 1, 6, 2, 0, 0, 4, 6),
        ]
        assert not has_unique_solution(grid)
        assert count_solutions(grid, limit=1) == 1

    def test_counts_that_cannot_be_met_give_no_solution(self) -> None:
        # Row 0 and row 2 each want two cells and the middle one, but column 1 holds a
        # single cell, so at most one of those rows can be filled from it. Both ends
        # are given and valid, so nothing about the board's shape is at fault.
        grid = TrackGrid(3, 3, (2, 1, 2), (3, 1, 1), (1, 0, 0, 0, 0, 0, 0, 0, 1))
        assert count_solutions(grid, limit=10) == 0
        assert _reference(grid) == []


class TestEverySolutionObeysTheRules:
    @pytest.mark.parametrize("seed", range(10))
    def test_no_solution_breaks_reciprocity_or_counts(self, seed: int) -> None:
        rng = random.Random(seed)
        checked = 0
        for _ in range(30):
            grid, intended = _grow(3, 3, rng)
            if grid is None:
                continue
            assert intended in list(iter_solutions(grid)), "the grown route must solve it"
            for assignment in iter_solutions(grid):
                assert obeys(grid, assignment), f"{grid} yielded {assignment}"
            checked += 1
        assert checked, "no grid was grown, so nothing was checked"

    def test_givens_are_never_overridden(self) -> None:
        """A search that ignored the givens would count routes the board forbids."""
        rng = random.Random(3)
        checked = 0
        for _ in range(30):
            grid, _ = _grow(3, 3, rng, density=1.0)
            if grid is None:
                continue
            for assignment in iter_solutions(grid):
                for cell, given in enumerate(grid.givens):
                    if given:
                        assert assignment[cell] == given
            checked += 1
        assert checked


class TestAgainstTheReference:
    @pytest.mark.parametrize("seed", range(4))
    def test_agrees_with_the_reference(self, seed: int) -> None:
        rng = random.Random(200 + seed)
        checked = 0
        for _ in range(25):
            grid, _ = _grow(4, 4, rng)
            if grid is None:
                continue
            assert sorted(iter_solutions(grid)) == sorted(_reference(grid))
            checked += 1
        assert checked


class TestLimits:
    def test_a_limit_of_zero_is_refused(self) -> None:
        with pytest.raises(TrackGridError, match="at least 1"):
            count_solutions(solved(3, 3), limit=0)

    def test_the_limit_saturates(self) -> None:
        grid = solved(3, 3)
        assert count_solutions(grid, limit=1) == 1
        assert count_solutions(grid, limit=50) == 1
        assert has_unique_solution(grid)


class TestCost:
    def test_a_published_size_can_be_exhausted_quickly(self) -> None:
        """Uniqueness means exhausting the search, so its cost is the generator's.

        The clues are what make this cheap: they put a ceiling on what each row and
        column can still reach, so the walk is cut short long before the board is
        full. The ceiling here is generous — this is a cost guard, not a benchmark.
        """
        rng = random.Random(12)
        found = None
        for _ in range(200):
            candidate = _grow(7, 7, rng)[0]
            if candidate is not None:
                found = candidate
                break
        assert found is not None, "no 7x7 grid was grown"
        start = time.perf_counter()
        count = count_solutions(found, limit=2)
        took = time.perf_counter() - start
        assert count >= 1
        assert took < 10.0, f"exhausting a 7x7 took {took:.2f}s"


# --- helpers shared by the tests above -------------------------------------


def _grow(width: int, height: int, rng: random.Random, density: float = 0.3):
    """A grid with a real solution, grown as a route of pieces.

    Both end pieces are given, which is what the format requires and what pins the
    line's two ends to the grid edge. A fraction of the interior pieces are frozen
    too, so the search is made to respect clues rather than solve a bare board.
    """
    n = width * height
    for _ in range(300):
        first = rng.choice([c for c in range(n) if c % width == 0])
        # The route is grown here and turned into pieces below.
        route = [first]
        cur, back = first, WEST
        target = rng.randint(max(3, (n * 2) // 5), (n * 4) // 5)
        for _ in range(n * 3):
            if len(route) >= target:
                break
            options = [
                (d, step)
                for d in range(4)
                if d != back
                and (step := _step(width, height, cur, d)) is not None
                and step not in route
            ]
            if not options:
                break
            direction, nxt = rng.choice(options)
            route.append(nxt)
            cur, back = nxt, (direction + 2) % 4

        last = route[-1]
        exits = [d for d in range(4) if _step(width, height, last, d) is None]
        if not exits or len(route) < 3:
            continue

        assignment = _pieces_along(width, height, route, (exits[0], back))

        rows = [0] * height
        cols = [0] * width
        for cell in route:
            r, c = divmod(cell, width)
            rows[r] += 1
            cols[c] += 1

        givens = [0] * n
        givens[route[0]] = assignment[route[0]]
        givens[route[-1]] = assignment[route[-1]]
        for cell in route[1:-1]:
            if rng.random() < density:
                givens[cell] = assignment[cell]
        try:
            grid = TrackGrid(width, height, tuple(rows), tuple(cols), tuple(givens))
        except TrackGridError:
            continue
        if obeys(grid, tuple(assignment)):
            return grid, tuple(assignment)
    return None, None


def _step(width: int, height: int, cell: int, direction: int) -> int | None:
    row, col = divmod(cell, width)
    match direction:
        case 0:
            return None if row == 0 else cell - width
        case 1:
            return None if col == width - 1 else cell + 1
        case 2:
            return None if row == height - 1 else cell + width
        case _:
            return None if col == 0 else cell - 1


def _pieces_along(width: int, height: int, route: list[int], ends: tuple[int, int]) -> list[int]:
    """The piece each cell on a route must hold.

    Interior cells join their predecessor and successor; the two ends join their
    neighbour and the edge of the grid, which is what makes them the open ends.
    """
    out = [0] * (width * height)
    exit_dir, back = ends
    last = len(route) - 1
    for position, cell in enumerate(route):
        if position == 0:
            out[cell] = _BY_ENDS[frozenset({WEST, EAST})]
        elif position == last:
            out[cell] = _BY_ENDS[frozenset({exit_dir, back})]
        else:
            out[cell] = _BY_ENDS[
                frozenset(
                    {
                        _facing(width, height, cell, route[position - 1]),
                        _facing(width, height, cell, route[position + 1]),
                    }
                )
            ]
    return out


def _facing(width: int, height: int, cell: int, other: int) -> int:
    for direction in range(4):
        if _step(width, height, cell, direction) == other:
            return direction
    raise AssertionError(f"cell {cell} is not adjacent to {other}")


def obeys(grid: TrackGrid, assignment: tuple[int, ...]) -> bool:
    """Whether an assignment satisfies the rules, checked from scratch.

    Independent of the search's own bookkeeping, which is the point: an earlier
    version emitted cell sets whose implied degrees disagreed with the edges it had
    recorded, and asking the solver would not have caught that.
    """
    for cell, given in enumerate(grid.givens):
        if given and assignment[cell] != given:
            return False

    open_ends = 0
    for cell in range(grid.cell_count):
        for direction in PIECE_ENDS[assignment[cell]]:
            other = _step(grid.width, grid.height, cell, direction)
            if other is None:
                open_ends += 1
            elif (direction + 2) % 4 not in PIECE_ENDS[assignment[other]]:
                # Reciprocity is the two ends facing *each other*, so `other` must end
                # back toward `cell`, which is the opposite direction.
                return False
    if open_ends != LINE_ENDS:
        return False

    rows = [0] * grid.height
    cols = [0] * grid.width
    for cell in range(grid.cell_count):
        if assignment[cell]:
            r, c = divmod(cell, grid.width)
            rows[r] += 1
            cols[c] += 1
    if tuple(rows) != grid.row_clues or tuple(cols) != grid.col_clues:
        return False

    on = [c for c in range(grid.cell_count) if assignment[c]]
    if not on:
        return False
    return len(_reachable(grid, assignment, on[0])) == len(on)


def _reachable(grid: TrackGrid, assignment: tuple[int, ...], start: int) -> set[int]:
    """Every cell reachable from `start` along the line."""
    seen, stack = {start}, [start]
    while stack:
        cur = stack.pop()
        for direction in PIECE_ENDS[assignment[cur]]:
            other = _step(grid.width, grid.height, cur, direction)
            if other is not None and assignment[other] and other not in seen:
                seen.add(other)
                stack.append(other)
    return seen


def _reference(grid: TrackGrid, cap: int | None = None) -> list[tuple[int, ...]]:
    """Every solution, assigned cell by cell with local checks only.

    Shares no state with the search: no union-find, no running totals, and the rules
    are re-derived from `PIECE_ENDS` each time. The only concession to speed is
    dropping a branch as soon as a cell contradicts its settled neighbours, rather
    than building a whole assignment and checking it — without that a 4x4 is 7**16.
    """
    n = grid.cell_count
    piece = [0] * n
    found: list[tuple[int, ...]] = []

    def local_ok(cell: int) -> bool:
        for direction in (NORTH, WEST):
            other = _step(grid.width, grid.height, cell, direction)
            if other is None or other > cell:
                continue
            back = (direction + 2) % 4
            if (direction in PIECE_ENDS[piece[cell]]) != (back in PIECE_ENDS[piece[other]]):
                return False
        return True

    def clues_ok(cell: int) -> bool:
        row, col = divmod(cell, grid.width)
        used_row = sum(1 for c in range(row * grid.width, cell + 1) if piece[c])
        used_col = sum(1 for c in range(n) if piece[c] and divmod(c, grid.width)[1] == col)
        return (
            used_row <= grid.row_clues[row]
            and used_col <= grid.col_clues[col]
            and used_row + (grid.width - 1 - col) >= grid.row_clues[row]
            and used_col + (grid.height - 1 - row) >= grid.col_clues[col]
        )

    def walk(cell: int) -> None:
        if cap is not None and len(found) >= cap:
            return
        if cell == n:
            if obeys(grid, tuple(piece)):
                found.append(tuple(piece))
            return
        given = grid.givens[cell]
        for value in (given,) if given else range(PIECE_COUNT + 1):
            piece[cell] = value
            if local_ok(cell) and clues_ok(cell):
                walk(cell + 1)
            piece[cell] = 0
            if cap is not None and len(found) >= cap:
                return

    walk(0)
    return found
