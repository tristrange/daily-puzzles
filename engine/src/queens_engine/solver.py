"""Exact solution counting.

Uniqueness is the one guarantee the player is never told about, so it has to be
proved rather than assumed. This module counts solutions exactly: it answers
"how many" with no heuristics, no sampling and no time cutoff, which is what
lets the generator treat a second solution as a hard rejection.

The search walks the board one row at a time. A row holds a fixed number of
stars, so a state is fully described by the row, the columns already used, how
many stars each region has so far, and which columns the previous row used (the
only reason the previous row is remembered is the no-touching rule).

Region counts are packed into a single integer in mixed radix rather than kept
as a tuple, so a state is four small ints instead of four ints and a list. That
matters because the memo is the whole point.

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
    region_of: tuple[tuple[int, ...], ...]
    full_mask: int


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
        region_of=region_of,
        full_mask=(1 << board.size) - 1,
    )


def _row_choices(
    search: _Search,
    row: int,
    col_mask: int,
    usage: int,
    prev_mask: int,
) -> Iterator[tuple[tuple[int, ...], int, int]]:
    """Yield `(columns, new_col_mask, new_usage)` for every legal way to fill `row`.

    All the rule logic lives here, so the counting and enumerating traversals
    cannot disagree about what is legal.
    """
    size = search.size
    # A column is unavailable if it is taken, or if the previous row has a star
    # in it or diagonally adjacent to it. Horizontal and vertical neighbours are
    # already excluded for Queens by the one-per-row and one-per-column rules;
    # checking them anyway is what lets the same code serve Star Battle.
    blocked = col_mask | prev_mask | (prev_mask << 1) | (prev_mask >> 1)
    free = [col for col in range(size) if not (blocked >> col) & 1]
    if len(free) < search.stars_per_row:
        return

    region_row = search.region_of[row]
    for cols in combinations(free, search.stars_per_row):
        mask = 0
        for col in cols:
            mask |= 1 << col

        # Two stars side by side in the same row would touch.
        if mask & (mask << 1):
            continue

        new_usage = usage
        overflowed = False
        for col in cols:
            region = region_row[col]
            if (new_usage // search.multiplier[region]) % (search.capacity[region] + 1) >= (
                search.capacity[region]
            ):
                overflowed = True
                break
            new_usage += search.multiplier[region]
        if overflowed:
            continue

        yield cols, mask, new_usage


def _count(
    search: _Search,
    row: int,
    col_mask: int,
    usage: int,
    prev_mask: int,
    *,
    limit: int,
    memo: dict[tuple[int, int, int, int], int],
) -> int:
    if row == search.size:
        # Every row placed `stars_per_row` stars, so the total is exactly
        # `sum(capacity)`, and no region was ever over-filled. Those two facts
        # together force every region to be exactly full, so there is nothing
        # left to check.
        return 1

    key = (row, col_mask, usage, prev_mask)
    cached = memo.get(key)
    if cached is not None:
        return cached

    total = 0
    for _cols, mask, new_usage in _row_choices(search, row, col_mask, usage, prev_mask):
        total += _count(search, row + 1, col_mask | mask, new_usage, mask, limit=limit, memo=memo)
        if total >= limit:
            total = limit
            break

    memo[key] = total
    return total


def _walk(
    search: _Search,
    row: int,
    col_mask: int,
    usage: int,
    prev_mask: int,
    *,
    placed: tuple[int, ...],
) -> Iterator[tuple[int, ...]]:
    if row == search.size:
        yield placed
        return

    for cols, mask, new_usage in _row_choices(search, row, col_mask, usage, prev_mask):
        cells = tuple(search.board.index(row, col) for col in cols)
        yield from _walk(search, row + 1, col_mask | mask, new_usage, mask, placed=placed + cells)


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
