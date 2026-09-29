"""Exact solution counting.

Uniqueness is the one guarantee the player is never told about, so it has to be
proved rather than assumed. This module counts solutions exactly: it answers
"how many" with no heuristics, no sampling and no time cutoff, which is what
lets the generator treat a second solution as a hard rejection.

The search walks the board one row at a time. A row holds a fixed number of
stars, so a state is fully described by the row, how many stars each column
holds, how many each region holds, and which columns the previous row used (the
only reason the previous row is remembered is the no-touching rule).

Both count sets are packed into a single integer in mixed radix rather than
kept as tuples, so a state is four small ints instead of four ints and two
lists. That matters because the memo is the whole point. With one star per row
the radix is 2 and the packed values *are* the bitmasks, so the Queens path is
the ordinary one.

Capacity is read from `Board.region_capacity` rather than passed separately, so
the capacity the solver honours is the same one `Board` validated. The two
cannot drift, and there is no argument to get wrong. Queens (every region holds
one star) and Star Battle (varied capacities) run the same code; the only
difference is the number of stars per row.
"""

from __future__ import annotations

from collections.abc import Iterator, Sequence
from dataclasses import dataclass
from itertools import combinations
from typing import Final

from queens_engine.board import Board

#: Default cap on how many solutions are counted. Two is the smallest number
#: that distinguishes "unique" from "ambiguous", which is all the generator
#: needs, and stopping early keeps hopeless boards cheap.
DEFAULT_LIMIT: Final[int] = 2


class SolverError(ValueError):
    """The board's capacities are inconsistent, so no search can be meaningful."""


@dataclass(frozen=True, slots=True)
class _Search:
    """Precomputed tables shared by every state of one search."""

    board: Board
    size: int
    stars_per_row: int
    capacity: tuple[int, ...]
    multiplier: tuple[int, ...]
    col_multiplier: tuple[int, ...]
    region_of: tuple[tuple[int, ...], ...]

    @property
    def radix(self) -> int:
        """Digits per column and per region: both cap at `stars_per_row`.

        For Queens this is 2, so both packed integers *are* the bitmasks, and
        the counting path is the same code that was always correct.
        """
        return self.stars_per_row + 1


def count_solutions(board: Board, *, limit: int = DEFAULT_LIMIT) -> int:
    """Count solutions, stopping at `limit`.

    Returns `min(actual, limit)`, so `limit=2` distinguishes zero, one and many
    without paying to enumerate the many. Pass a large `limit` for the true
    count.
    """
    if limit < 1:
        raise SolverError(f"limit must be at least 1, got {limit}")
    search = _prepare(board)
    # The memo is per call, not per board: a cached value is a truncated count,
    # so it only means anything against the limit it was computed with.
    return _count(search, 0, 0, 0, 0, limit=limit, memo={})


def iter_solutions(board: Board) -> Iterator[tuple[int, ...]]:
    """Yield every solution, each as the sorted cell indices holding a star.

    Unbounded and uncached, for callers that need the solutions themselves —
    the generator's replay check and the shared board fixtures. Use
    `count_solutions` when only the number matters; it memoises and can bail
    out early, which this cannot.
    """
    search = _prepare(board)
    yield from _walk(search, 0, 0, 0, 0, placed=())


def has_unique_solution(board: Board) -> bool:
    """Whether the board has exactly one solution."""
    return count_solutions(board, limit=2) == 1


def _prepare(board: Board) -> _Search:
    capacity = board.region_capacity
    total = sum(capacity)
    if total % board.size != 0:
        raise SolverError(
            f"capacities total {total}, which is not divisible by the grid size {board.size}"
        )
    stars_per_row = total // board.size
    if not 1 <= stars_per_row <= board.size:
        raise SolverError(
            f"capacities imply {stars_per_row} stars per row, outside 1..{board.size}"
        )

    multiplier: list[int] = []
    running = 1
    for cap in capacity:
        multiplier.append(running)
        running *= cap + 1

    # Columns pack the same way, but every column holds the same number of
    # stars, so one radix covers all of them.
    col_multiplier = tuple((stars_per_row + 1) ** col for col in range(board.size))

    region_of = tuple(
        tuple(board.region_at(board.index(row, col)) for col in range(board.size))
        for row in range(board.size)
    )

    return _Search(
        board=board,
        size=board.size,
        stars_per_row=stars_per_row,
        capacity=capacity,
        multiplier=tuple(multiplier),
        col_multiplier=col_multiplier,
        region_of=region_of,
    )


def _row_choices(
    search: _Search,
    row: int,
    col_usage: int,
    usage: int,
    prev_mask: int,
) -> Iterator[tuple[tuple[int, ...], int, int, int]]:
    """Yield `(columns, new_col_usage, new_usage, mask)` for every legal row.

    All the rule logic lives here, so the counting and enumerating traversals
    cannot disagree about what is legal.
    """
    size = search.size
    radix = search.radix
    # A column is unavailable once it holds its share of stars, or if the
    # previous row has a star in it or diagonally adjacent to it. Checking the
    # horizontal and vertical neighbours here is redundant for Queens, which get
    # that from one-per-row and one-per-column, and is exactly what Star Battle
    # needs, since a column there holds more than one star.
    adjacent = prev_mask | (prev_mask << 1) | (prev_mask >> 1)
    free = [
        col
        for col in range(size)
        if not (adjacent >> col) & 1
        and (col_usage // search.col_multiplier[col]) % radix < search.stars_per_row
    ]
    if len(free) < search.stars_per_row:
        return

    region_row = search.region_of[row]
    for cols in combinations(free, search.stars_per_row):
        mask = 0
        new_col_usage = col_usage
        new_usage = usage
        overflowed = False
        for col in cols:
            mask |= 1 << col
            region = region_row[col]
            if (new_usage // search.multiplier[region]) % (search.capacity[region] + 1) >= (
                search.capacity[region]
            ):
                overflowed = True
                break
            new_usage += search.multiplier[region]
            new_col_usage += search.col_multiplier[col]
        if overflowed:
            continue

        # Two stars side by side in the same row would touch.
        if mask & (mask << 1):
            continue

        yield cols, new_col_usage, new_usage, mask


def _count(
    search: _Search,
    row: int,
    col_usage: int,
    usage: int,
    prev_mask: int,
    *,
    limit: int,
    memo: dict[tuple[int, int, int, int], int],
) -> int:
    if row == search.size:
        # Every row placed `stars_per_row` stars, so the total is exactly
        # `sum(capacity)`. No region and no column was ever over-filled, and
        # those caps also sum to `sum(capacity)`, so every region and every
        # column is exactly full. There is nothing left to check.
        return 1

    key = (row, col_usage, usage, prev_mask)
    cached = memo.get(key)
    if cached is not None:
        return cached

    total = 0
    for _cols, new_col_usage, new_usage, mask in _row_choices(
        search, row, col_usage, usage, prev_mask
    ):
        total += _count(search, row + 1, new_col_usage, new_usage, mask, limit=limit, memo=memo)
        if total >= limit:
            total = limit
            break

    memo[key] = total
    return total


def _walk(
    search: _Search,
    row: int,
    col_usage: int,
    usage: int,
    prev_mask: int,
    *,
    placed: tuple[int, ...],
) -> Iterator[tuple[int, ...]]:
    if row == search.size:
        yield placed
        return

    for cols, new_col_usage, new_usage, mask in _row_choices(
        search, row, col_usage, usage, prev_mask
    ):
        cells = tuple(search.board.index(row, col) for col in cols)
        yield from _walk(search, row + 1, new_col_usage, new_usage, mask, placed=placed + cells)


def format_solution(board: Board, solution: Sequence[int]) -> str:
    """Render a solution as an ASCII grid, for CLI output and test failures."""
    stars = set(solution)
    lines: list[str] = []
    for row in range(board.size):
        cells: list[str] = []
        for col in range(board.size):
            if board.index(row, col) in stars:
                cells.append(" Q")
            else:
                cells.append(f" {board.region_at(board.index(row, col))}")
        lines.append("".join(cells))
    return "\n".join(lines)


__all__ = [
    "DEFAULT_LIMIT",
    "SolverError",
    "count_solutions",
    "format_solution",
    "has_unique_solution",
    "iter_solutions",
]
